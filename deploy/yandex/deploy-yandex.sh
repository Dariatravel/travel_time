#!/usr/bin/env bash
set -euo pipefail

required_vars=(
  YC_REGISTRY_ID
  YC_CONTAINER_NAME
  YC_SERVICE_ACCOUNT_ID
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing required environment variable: ${var}" >&2
    exit 1
  fi
done

if ! command -v yc >/dev/null 2>&1; then
  echo "yc CLI is not installed. Install it from https://yandex.cloud/ru/docs/cli/quickstart" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed or not running." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
REVISION="${REVISION:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD)}"
IMAGE="cr.yandex/${YC_REGISTRY_ID}/travel-time:${REVISION}"

echo "Building ${IMAGE}"
docker build \
  --platform linux/amd64 \
  --build-arg "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" \
  --build-arg "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
  -t "${IMAGE}" \
  "${ROOT_DIR}"

echo "Pushing ${IMAGE}"
docker push "${IMAGE}"

echo "Deploying serverless container revision"
yc serverless container revision deploy \
  --container-name "${YC_CONTAINER_NAME}" \
  --image "${IMAGE}" \
  --service-account-id "${YC_SERVICE_ACCOUNT_ID}" \
  --memory "${YC_MEMORY:-1GB}" \
  --cores "${YC_CORES:-1}" \
  --execution-timeout "${YC_EXECUTION_TIMEOUT:-30s}" \
  --concurrency "${YC_CONCURRENCY:-16}" \
  --environment "NODE_ENV=production,NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL},NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}"

CONTAINER_ID="$(yc serverless container get "${YC_CONTAINER_NAME}" --format json | node -e "let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>console.log(JSON.parse(data).id))")"

if [[ -n "${YC_API_GATEWAY_NAME:-}" ]]; then
  TMP_SPEC="$(mktemp)"
  CONTAINER_ID="${CONTAINER_ID}" \
  SERVICE_ACCOUNT_ID="${YC_SERVICE_ACCOUNT_ID}" \
  SPEC_TEMPLATE="${SCRIPT_DIR}/api-gateway.yaml" \
  SPEC_OUTPUT="${TMP_SPEC}" \
    node - <<'NODE'
const fs = require('fs');

const input = fs.readFileSync(process.env.SPEC_TEMPLATE, 'utf8');
const output = input
  .replaceAll('${CONTAINER_ID}', process.env.CONTAINER_ID)
  .replaceAll('${SERVICE_ACCOUNT_ID}', process.env.SERVICE_ACCOUNT_ID);

fs.writeFileSync(process.env.SPEC_OUTPUT, output);
NODE

  if yc serverless api-gateway get "${YC_API_GATEWAY_NAME}" >/dev/null 2>&1; then
    echo "Updating API Gateway ${YC_API_GATEWAY_NAME}"
    yc serverless api-gateway update "${YC_API_GATEWAY_NAME}" --spec "${TMP_SPEC}"
  else
    echo "Creating API Gateway ${YC_API_GATEWAY_NAME}"
    yc serverless api-gateway create "${YC_API_GATEWAY_NAME}" --spec "${TMP_SPEC}"
  fi

  rm -f "${TMP_SPEC}"
fi

echo "Done. Image: ${IMAGE}"
