#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

# Older production schema changes were applied outside Supabase CLI history.
# db push would therefore replay old, already-applied files. This release ledger
# applies only the audited migrations that the matching application image needs.
# The transactional external-sync migration is deliberately deferred: no source
# has been moved to its RPC or verified on a database copy yet.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.deployment_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

# Миграция 20260818204803 (sync_runs + sync_external_occupancy) намеренно НЕ входит
# в этот список: RPC пока никем не вызывается, кроны на неё не переведены.
# Добавить сюда одновременно с первым переводом синхронизации на RPC.
migrations=(
    "supabase/migrations/20260818204327_close_user_metadata_leak.sql"
    "supabase/migrations/20260818204404_create_user_roles.sql"
    "supabase/migrations/20260818204407_replace_metadata_rls.sql"
    "supabase/migrations/20260818204445_finalize_roles_and_calendar_access.sql"
    "supabase/migrations/20260818204516_unify_availability_night_logic.sql"
)

for migration in "${migrations[@]}"; do
    checksum="$(sha256sum "$migration" | awk '{print $1}')"
    applied_checksum="$(
        psql "$SUPABASE_DB_URL" -At -v ON_ERROR_STOP=1 \
            -c "SELECT checksum FROM app_private.deployment_migrations WHERE name = '$migration'"
    )"

    if [[ -n "$applied_checksum" ]]; then
        if [[ "$applied_checksum" != "$checksum" ]]; then
            echo "::error::Applied migration content changed: $migration"
            exit 1
        fi
        echo "Already applied: $migration"
        continue
    fi

    echo "Applying: $migration"
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$migration"
    psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -c \
        "INSERT INTO app_private.deployment_migrations (name, checksum) VALUES ('$migration', '$checksum')"
done
