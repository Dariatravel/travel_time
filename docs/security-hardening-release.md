# Security hardening — release decision

## Included in the first release

- role hardening migrations `20260818204327` through `20260818204445`;
- night-availability migration `20260818204516`;
- matching application code.

`scripts/apply-release-migrations.sh` applies these migrations before the
container image is deployed. It uses `app_private.deployment_migrations`
because historical production changes were not consistently registered in
Supabase CLI migration history.

## Deferred intentionally

`20260818204803_add_transactional_external_sync.sql` is **not included** in
the release script. No sync source calls its RPC yet, and it has not passed the
required copy-of-production test. It must be enabled later per source behind a
feature flag, beginning with the simplest source.

## Rollback

1. Deploy the previous application image.
2. Run `manual/rollback_unify_availability_night_logic.sql` if the search RPC
   was applied.
3. Run `manual/rollback_roles_hardening.sql`.

The role rollback copies `user_roles.role` back into
`auth.users.raw_user_meta_data.role` before dropping the table, allowing the
previous metadata-based application and policies to continue working.
