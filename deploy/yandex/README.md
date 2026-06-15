# Yandex Cloud Deployment

This folder prepares a Russian-region fallback deployment for Travel Time.

Recommended architecture:

1. Docker image in Yandex Container Registry.
2. Next.js app in Yandex Serverless Containers.
3. Yandex API Gateway in front of the container.
4. Custom domain + HTTPS certificate on API Gateway.

## What The Owner Must Provide

- Yandex Cloud account with billing enabled.
- A cloud/folder selected in the `yc` CLI.
- A free domain or subdomain, for example `app.example.ru`.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values from the current production app.

Do not publish `SUPABASE_SERVICE_ROLE_KEY` to the browser or this container.

## Current Yandex Resources

These resources are already prepared in the `travel-time-calendar` folder:

- Cloud ID: `b1g43dk01a0t2mt0aqhm`
- Folder ID: `b1gam66bh2jtelu9656g`
- Service account: `travel-time-calendar` / `ajengmf1j6jbk729ut5q`
- Container Registry: `travel-time` / `crpf4seergfpqlkg7iih`
- Serverless Container: `travel-time` / `bba9m3mhd35emm53g7ke`
- API Gateway: `travel-time` / `d5d4qekr1vt33i1f6g42`
- Gateway domain: `d5d4qekr1vt33i1f6g42.tmjd4m4j.apigw.yandexcloud.net`

## One-Time Yandex Setup

Install and authenticate the CLI:

```bash
curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash
yc init
```

Create the resources:

```bash
yc container registry create --name travel-time
yc iam service-account create --name travel-time-runtime
yc serverless container create --name travel-time
```

Grant the service account the roles it needs to pull images and run behind API Gateway:

```bash
FOLDER_ID="$(yc config get folder-id)"
SERVICE_ACCOUNT_ID="$(yc iam service-account get travel-time-runtime --format json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).id))")"

yc resource-manager folder add-access-binding "$FOLDER_ID" \
  --role container-registry.images.puller \
  --subject serviceAccount:"$SERVICE_ACCOUNT_ID"

yc resource-manager folder add-access-binding "$FOLDER_ID" \
  --role serverless.containers.invoker \
  --subject serviceAccount:"$SERVICE_ACCOUNT_ID"
```

Configure Docker auth for Yandex Container Registry:

```bash
yc container registry configure-docker
```

## Deploy

### GitHub Actions

The repository includes `.github/workflows/deploy-yandex.yml`. It builds the Docker image in GitHub Actions, pushes it to Yandex Container Registry, deploys a new Serverless Container revision, and creates or updates API Gateway.

Required GitHub Secrets:

- `YC_SA_JSON`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The workflow runs on pushes to `main` and can also be started manually from GitHub Actions.

### Local Docker

If Docker is available locally, export variables and run:

```bash
export YC_REGISTRY_ID="crpf4seergfpqlkg7iih"
export YC_CONTAINER_NAME="travel-time"
export YC_API_GATEWAY_NAME="travel-time"
export YC_SERVICE_ACCOUNT_ID="ajengmf1j6jbk729ut5q"
export NEXT_PUBLIC_SUPABASE_URL="<supabase-url>"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="<supabase-anon-key>"

bash deploy/yandex/deploy-yandex.sh
```

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are passed both at Docker build time and at container runtime. This is required because Next.js embeds public environment variables into client-side JavaScript during `next build`.

The first deploy creates or updates the API Gateway. The command output will show the gateway domain.

## Domain And HTTPS

In Yandex Certificate Manager, create a managed Let's Encrypt certificate for your domain using DNS validation.

Then add the domain to API Gateway and point DNS to it:

- For `www` or a subdomain: use a `CNAME` record shown by Yandex Cloud.
- For an apex/root domain: delegate DNS to Yandex Cloud DNS and use `ANAME`, or use a subdomain like `app.example.ru`.

Recommended: use a subdomain such as `app.example.ru` for the fallback app.

## Local Container Check

```bash
docker build -t travel-time-local .
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e NEXT_PUBLIC_SUPABASE_URL="<supabase-url>" \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY="<supabase-anon-key>" \
  travel-time-local
```

Open `http://localhost:8080`.
