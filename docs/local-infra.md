# Local infrastructure repair

MinIO's community Docker Hub images are no longer available. Local Compose uses SeaweedFS 4.53 in mini mode (https://github.com/seaweedfs/seaweedfs/releases/tag/4.53). The host S3 URL remains http://127.0.0.1:9000; the internal worker URL is http://storage:8333. Existing sample bucket and credentials are unchanged. No production storage change: Cloudflare R2 remains the deployment target.

From the project root, after npm run setup and copying .env.example if needed:

```sh
docker compose --profile worker down --remove-orphans
npm run infra:up
docker compose ps -a
docker compose logs storage-init
docker compose --profile worker up -d --build --scale worker=1 worker
npm run dev:api
# another terminal
npm run dev:web
```

Redis must respond PONG, storage-init must exit 0, and worker must be running before expecting conversionAvailable=true. The storage-init image uses the existing AWS SDK versions and automatically waits for the precreated bucket, sets exact local-origin CORS and two-day lifecycle, and probes signed-length rejection, conditional overwrite protection, authenticated read and copy. It fails visibly if any required contract is unsupported; do not bypass the checks. To debug, use docker compose logs storage storage-init or docker compose logs worker. On a failed initialization, rerun npm run infra:up once the issue is resolved. No login to MinIO registries is needed.

The new storage uses a separate seaweed-data volume; old minio-data is not deleted or migrated. Never use docker compose down -v unless intentionally discarding local data. Existing old local jobs may point to absent objects; use fresh test uploads. Only the S3 port is published on loopback, not an admin console. Trusted local test files only. If Redis is unavailable, the API reports a clear startup error when jobs are enabled; with jobs disabled it can start in browser-only mode. Restart the API after infrastructure is ready.

The change was source-reviewed but container image pulls, storage checks and end-to-end integration could not be executed in the authoring environment. The initializer is the live acceptance check, not evidence that the selected provider already passed. If a registry tag, CORS or S3 behavior fails, inspect the initializer logs; public conversion must remain disabled.
