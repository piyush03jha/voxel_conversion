# Phase 2 — Redis, BullMQ and temporary object storage

## Local development

1. Use Node 22.12+ and Docker Compose. Run npm run setup (updates apps/api/package-lock.json for the new dependencies; commit it before deployment).
2. Copy .env.example to .env. Run npm run infra:up and check docker compose logs minio-init. Bucket formshift-temp is private; do not make it public.
3. For an isolated smoke test only, change QUEUE_ACCEPT_JOBS=true in .env. Run npm run dev:api. Run npm run smoke:queue in another terminal. No worker should be running. Set QUEUE_TEST_MODE=true as well; Phase 3 otherwise requires a worker heartbeat. Queue-only mode is blocked when NODE_ENV=production.
4. Run npm test, npm run build, npm run lint. Reset QUEUE_ACCEPT_JOBS=false before public use.

Local MinIO console: http://127.0.0.1:9001. The sample credentials and latest MinIO tags are for local development only. Redis is bound to loopback, uses noeviction and a persistent volume. Never expose Redis publicly.

## API

- GET /api/health: liveness and Redis/configuration flags (not proof of bucket connectivity).
- POST /api/jobs/uploads: JSON { filename, size, outputFormat, compression?, color? }. Returns id, secret bearer token, signed PUT URL, required headers, and expiry times. Browser PUTs the File directly with the returned headers; Content-Length is set automatically by the browser, never manually.
- POST /api/jobs/:id/submit: verifies stored byte size and ETag, then adds a single BullMQ job using the session ID. Retry is idempotent.
- GET /api/jobs/:id: owner-only status, approximate waiting position and null ETA until real worker metrics exist.
- DELETE /api/jobs/:id: cancel an unsubmitted or waiting job; active cancellation is a worker-phase task.
- GET /api/jobs/:id/download: only a completed job with an existing output receives an expiring signed URL.

Except upload creation, job requests require Authorization: Bearer <token>. Keep the token and signed URL out of logs, analytics, query strings, and shared caches. The API stores only its SHA-256 hash and job metadata. Random IDs are not authorization. All job response headers use no-store. No database or model buffers are used.

## Admission and expiry

Atomic Redis Lua admission caps outstanding upload reservations and queued/active jobs at 100 across API replicas; terminal jobs release capacity on the sweep. A global create rate limit of 30/minute protects initial development. A per-session Redis lock serializes submission, cancellation, and expiry cleanup during normal operation. It has a two-minute lease; this is not a fencing guarantee across Redis outages or stalled API processes. Keep the worker disabled until concurrency/recovery tests are complete. A signed PUT binds the expected size, content type and If-None-Match: *; HEAD rechecks byte count and ETag. The conditional write prevents replacing uploaded input. Actual file content is NOT trusted yet; the worker must validate it before processing.

Default upload URL: 15 minutes. Job lifetime: 24 hours from session creation. Expiry cleanup runs every minute, bounded to 100 due sessions/pass. Unsubmitted/cancelled objects are not deleted until the PUT has expired plus a grace minute to reduce replay risk. Uploads begun before expiry could still finish late; the bucket lifecycle rule is mandatory. Waiting expired jobs are removed; active jobs are never forcibly removed by the API. Cleanup retries on failure; use a bucket lifecycle expiry of 2 days as a fallback. Completed/failed jobs retain metadata until expiry. Lost Redis data may leave orphan objects until bucket lifecycle runs. The 100-slot cap does not cap retained completed output bytes; monitor bucket usage.

## Cloudflare R2 / Railway

- Provision a private R2 bucket and bucket-scoped read/write token. Set STORAGE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com, STORAGE_REGION=auto, STORAGE_FORCE_PATH_STYLE=true, bucket and credentials in Railway variables. Do not use public R2 URLs or commit secrets. Set HOST=0.0.0.0 in Railway.
- Set bucket CORS to the exact deployed web origin, allow PUT and Content-Type/If-None-Match headers; configure lifecycle expiry on temporary/ after 2 days. Confirm signed uploads with the actual browser and provider before enabling.
- Use a private Railway Redis URL with noeviction and sufficient RAM/persistence. Use HTTPS for API and storage. Add edge per-IP rate limits and abuse protection before making uploads public; global admission/rate limits alone do not prevent denial of service.
- Keep QUEUE_ACCEPT_JOBS=false until the real worker, content validation, resource limits, and integration tests are ready. The public upload UI remains disabled; see phase-3.md for worker integration.

Known limitations: no actual conversion, no running worker, no active-job cancellation, no measured ETA, no verified production provider/deployment. Signed upload length enforcement, conditional writes, cleanup under concurrency and 200 MiB resource behavior require live integration tests. The API lockfile needs regeneration; install and commit it before deploying.
