# Yandex Backend Proxy

This is an experimental safety layer for Russian-region connectivity.

Current production behavior is unchanged: the frontend still talks directly to Supabase unless code is explicitly switched later.

## Safety Defaults

- API routes are disabled unless `YANDEX_BACKEND_PROXY_ENABLED=true`.
- The UI does not call these routes yet.
- Supabase `service_role` is not used here. Routes forward the user's `Authorization` header to keep Supabase RLS/auth behavior intact.
- Read cache is in-memory and short-lived. It is only an acceleration layer, not a second database.

## Staging Resources

These resources are isolated from production:

- Serverless Container: `travel-time-staging` / `bbae7b6hi1q46eangsa7`
- API Gateway: `travel-time-staging`
- Image repository: `cr.yandex/crpf4seergfpqlkg7iih/travel-time-staging:<commit>`
- Workflow: `.github/workflows/deploy-yandex-staging.yml`

The staging workflow enables `YANDEX_BACKEND_PROXY_ENABLED=true`, but keeps
`NEXT_PUBLIC_USE_YANDEX_BACKEND_PROXY=false`. This allows route testing without
switching frontend reads/writes to the proxy.

## Added Routes

### Read Calendar

`GET /api/yandex-backend/hotels/:hotelId/calendar`

Query params:

- `allowedRooms`: optional comma-separated room IDs.

Behavior:

- reads hotel + rooms + reserves through Supabase;
- retries transient network errors;
- caches successful responses for `YANDEX_BACKEND_PROXY_CACHE_TTL_MS` or `10000` ms by default.

### Update Reserve

`PATCH /api/yandex-backend/reserves/:reserveId`

Headers:

- `Authorization`: required Supabase user bearer token.
- `Idempotency-Key`: optional; reserved for the future durable queue step.

Behavior:

- updates one reserve through Supabase with retry;
- clears local read cache after a successful mutation;
- returns `queued: false`.

## Rollout Plan

1. Deploy with `YANDEX_BACKEND_PROXY_ENABLED` unset or `false`.
2. Manually test the routes in a non-production session by enabling the flag in a preview/staging container.
3. Add a frontend feature flag such as `NEXT_PUBLIC_USE_YANDEX_BACKEND_PROXY=true`.
4. Switch only one read path first: single hotel calendar details.
5. Watch latency, Supabase errors, and stale data behavior.
6. Add durable writes with Yandex Message Queue only after read proxy is stable.

## Durable Queue Step

Do not use only in-memory queues for reserve writes in production. Serverless containers can restart and lose memory.

Recommended production queue pieces:

- Yandex Message Queue for reserve write jobs.
- Yandex Lockbox for Supabase credentials if service credentials become necessary.
- Idempotency table in Supabase or Yandex PostgreSQL to deduplicate retries.
- A worker container/function that drains the queue and writes to Supabase.
