#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

migrations=(
    "supabase/migrations/20260818204327_close_user_metadata_leak.sql"
    "supabase/migrations/20260818204404_create_user_roles.sql"
    "supabase/migrations/20260818204407_replace_metadata_rls.sql"
    "supabase/migrations/20260818204445_finalize_roles_and_calendar_access.sql"
    "supabase/migrations/20260818204516_unify_availability_night_logic.sql"
    "supabase/migrations/20260818204803_add_transactional_external_sync.sql"
    "supabase/migrations/20260824090000_add_sync_freshness_alerts.sql"
    "supabase/migrations/20260827100000_assignable_users_with_surname.sql"
)

# Файлы, применённые ДО появления этого реестра — вручную, вне Supabase CLI.
# Повторно их не проигрываем, но перечисляем поимённо: см. проверку ниже.
legacy=(
    "supabase/migrations/20250613_add_reserve_history.sql"
    "supabase/migrations/20250614_add_hotel_search_visibility.sql"
    "supabase/migrations/20250614_rollback_hotel_search_visibility.sql"
    "supabase/migrations/20250617_add_external_reserve_fields.sql"
    "supabase/migrations/20250619_reserve_history_rls_by_role.sql"
    "supabase/migrations/20250620_add_room_closures.sql"
    "supabase/migrations/20250624_add_realtycalendar_webhook_events.sql"
    "supabase/migrations/20250628_add_realtycalendar_webhook_events_staff_select.sql"
    "supabase/migrations/20250628_add_reserve_deleted_items.sql"
    "supabase/migrations/20250706_add_reserve_fixed_flag.sql"
    "supabase/migrations/20260713_prevent_double_booking.sql"
    "supabase/migrations/20260714_dump_search_rpc_functions.sql"
    "supabase/migrations/20260719_fix_reserve_deleted_items_rls.sql"
    "supabase/migrations/20260724_add_service_buffer_row.sql"
    "supabase/migrations/20260725_no_buffer_for_single_room.sql"
    "supabase/migrations/20260808_add_telegram_chat_messages.sql"
)

# Ни одна миграция не должна потеряться. 27.08.2026 новый файл просто не попал
# в список — выкатка прошла «успешно», а миграция молча не применилась, и в
# интерфейсе не хватало данных. Теперь новый файл обязан быть отнесён либо к
# migrations (применяем), либо к legacy (уже применена вручную).
for file in supabase/migrations/*.sql; do
    if ! printf '%s\n' "${migrations[@]}" "${legacy[@]}" | grep -qxF "$file"; then
        echo "::error::Миграция не зарегистрирована: $file"
        echo "Добавьте её в массив migrations (применить) или legacy (уже применена вручную)."
        exit 1
    fi
done

# Older production schema changes were applied outside Supabase CLI history.
# db push would therefore replay old, already-applied files. This release ledger
# applies only the audited migrations that the matching application image needs.
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE IF NOT EXISTS app_private.deployment_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
SQL

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
