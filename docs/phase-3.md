# Phase 3: first conversion worker

## Development setup

Use Node 22.12+, Linux or Docker, private Redis/MinIO. From repository root:

1. npm run setup (refresh and commit apps/api/package-lock.json; Phase 2 dependency changes are not yet locked).
2. Copy missing settings from .env.example into .env. Set QUEUE_ACCEPT_JOBS=true and QUEUE_TEST_MODE=false for isolated development.
3. npm run infra:up
4. npm run worker:up (builds and starts two worker replicas; use docker compose --profile worker up -d --build --scale worker=1 worker on a low-memory laptop).
5. npm run dev:api in another terminal.
6. Check /api/health: workers should be 1 or 2, conversionAvailable true. /api/formats advertises only STL → GLB.
7. npm run smoke:conversion; npm test; npm run test:native (Linux); npm run build; npm run lint.
8. Stop workers with docker compose --profile worker stop worker. Reset QUEUE_ACCEPT_JOBS=false for public use.

For a trusted Linux host with Python 3 and util-linux prlimit installed, use npm run dev:worker instead of Docker (do not run both unless intended). The root npm build compiles the worker with the existing API package; the worker runs as a separate process/service. No additional npm dependencies.

## Processing path

BullMQ job claim → validate UUID, allowed keys, size, options, expiry → download using If-Match and bounded stream → private job directory → strict STL content preflight → ADVFX dense native converter → verify GLB structure → conditional streamed upload → mark complete → delete job directory. API signs a download only after BullMQ marks completion and confirms output exists. Input/output objects remain subject to Phase 2 expiry and bucket lifecycle.

Each replica uses concurrency one, attempts one, maxStalledCount zero, 120-second BullMQ lock, 30-second stalled check. Heartbeats expire after 30 seconds; API fails closed when no heartbeat exists unless explicitly in queue-only test mode. A Redis error aborts active subprocess work. Explicit lock-extension checks before conversion, output upload and completion reduce stale-worker publication; crash/lock loss can still leave an orphan output until lifecycle cleanup. A conditional output write prevents overwrite. These are not a full distributed fencing protocol. No retries of invalid files and no fallback to Blender.

Default 10-minute job deadline includes transfers/conversion; reduced by job expiry. Default 768 MiB converter virtual address-space cap, 1 CPU thread, 4 million input triangles, 1.5 million unique vertex cells, 200 MiB output cap, 1 GiB local container memory and 1 CPU. 200 MiB is an admission limit, not a guarantee that every model fits worker limits. Complex meshes may fail safely. Linux prlimit and process-group SIGKILL constrain subprocesses; subprocess receives a minimal environment without storage credentials. Container runs non-root with dropped capabilities. Disk usage is bounded per input/output but a hard disk quota and cleanup after forced container termination are infrastructure tasks. No full per-job filesystem/network sandbox yet.

## Scope

- STL binary/ASCII to GLB with None compression, no custom color. Exact vertex welding (degenerate faces may be dropped), no intentional decimation. STL color extensions and original normals are not preserved by the native converter.
- Remaining 14 input formats are planned only. Blender and 3MF scripts are copied from ADVFX for subsequent audited routes. Optional trusted local Blender STL path requires Blender 4.5 and may need a larger memory cap.
- No real ETA, active cancellation, additional exporters, compression or exported custom color. Frontend submission still disabled; use API smoke test for this milestone.
- Queue-only Phase 2 test: stop worker, set QUEUE_TEST_MODE=true and QUEUE_ACCEPT_JOBS=true, restart API, run npm run smoke:queue. Never enable queue-only mode in public deployment.
- No live production deployment. Verify signed length and conditional PUT on R2, test two workers, stalls, invalid files, memory usage on 200 MiB models, per-IP limits, and sandboxing before enabling public conversion.

## Railway

Build worker separately using apps/worker/Dockerfile from repo root; use the same private Redis and R2 settings as API. Start two replicas only after resource benchmarking. No public port required. Production admission remains false by default. Docker build currently uses npm install because Phase 2 lockfile is stale; switch to npm ci once refreshed and verified.
