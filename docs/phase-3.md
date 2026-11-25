# Phase 3 — Existing ADVFX conversion engine

Scope: reuse the existing 15 input formats only, with GLB as the sole output. Additional import/export development (Phase 4) is deferred until the client requests it. Phase 5 adds compression; custom color is paused.

## Existing routes

- STL: strict content validation, native dense mesh converter by default.
- PLY: native dense mesh converter, then Blender only on explicit unsupported exit code 3.
- 3MF: native 3MF converter, then existing Blender add-on on exit code 3.
- OBJ: ADVFX's large geometry-only native route (30 MiB threshold), otherwise Blender.
- GLB: structural preflight and passthrough when None is selected.
- FBX, GLTF, USD, USDA, USDC, USDZ, ABC, BVH, SVG, PDF: existing Blender importer. PDF uses Poppler first-page conversion. GLTF must be self-contained; external dependencies are not uploaded. SVG/PDF have the inherited vector limitations; BVH produces a visual skeleton and Alembic may export only a static frame.

All three original scripts are copied from ADVFX at the pinned source commit; see apps/worker/scripts/PROVENANCE.md. No changes to ADVFX. The native route does not preserve all source normals, UV/material features or color extensions. Import support is not a guarantee of full fidelity or compatibility with every file.

## Local setup (trusted fixtures only)

Node 22.12+, Docker Compose, Linux.
1. npm run setup (regenerate apps/api/package-lock.json and commit after verification).
2. Add missing .env settings from .env.example. Set QUEUE_ACCEPT_JOBS=true, QUEUE_TEST_MODE=false, WORKER_SANDBOX=trusted-local for isolated local testing; never use this mode for untrusted/public inputs.
3. npm run infra:up
4. npm run worker:up (two replicas; use docker compose --profile worker up -d --build --scale worker=1 worker for a lower-memory machine).
5. npm run dev:api
6. GET /api/health and /api/formats; when worker is ready, all 15 input routes to GLB are advertised.
7. npm run smoke:conversion; npm test; npm run test:native; npm run build; npm run lint.
8. Test each existing format using SMOKE_MODEL_PATH=/absolute/path/to/fixture npm run smoke:conversion. Use fixtures with supported geometry and no external dependencies. See phase-5.md for compression.
9. Stop worker and reset QUEUE_ACCEPT_JOBS=false before public use.

The worker image includes the same Blender 4.5.14, 3MF add-on commit and glTF Transform 4.5.1 versions as ADVFX. For a native local worker, install the equivalent tools and run npm run dev:worker. The worker process is separate from NestJS.

## Resource and security boundaries

The worker streams object files with ETag validation; local file names are generated from a strict allowlist; GLB container structure is checked; 3MF/USDZ archive paths, entry counts, expanded sizes and ratios are bounded. Invalid native inputs, memory failures and timeouts are not retried. The job directory is removed on completion or failure. The output is uploaded conditionally before marking the job complete. Metadata and objects expire under the Phase 2 cleanup rules.

One active job per worker, 10-minute overall deadline, no automatic retries, 200 MiB input/output caps, 768 MiB native virtual address-space cap, 4 GiB Blender virtual address-space cap (not physical RAM), 1 GiB local container RAM and one CPU by default. Optimizer has a separate heap/time budget; see phase-5.md. Native geometry limits and all caps remain configurable. Benchmark real 200 MiB models before increasing concurrency or declaring support.

Public conversion requires explicit PUBLIC_CONVERSION_APPROVED=true and QUEUE_ACCEPT_JOBS=true on a production API, plus WORKER_SANDBOX=bwrap on production workers. The sandbox restricts filesystem mounts, network and subprocess environment. Worker probes the sandbox before advertising readiness and does not silently fall back to unsandboxed execution. Namespace availability on Railway has NOT been verified; if it fails, deployment must stay disabled until an equivalent supported isolation mechanism is established. Local Docker Compose intentionally uses trusted-local mode for developer fixtures only. Never expose it publicly. Additional rate limits, malicious-file/format testing, storage provider verification, memory benchmarks and crash recovery remain release gates.

Upgrade API and all worker replicas together (heartbeat version changed). Stop old workers before accepting new jobs. No real ETA, active cancellation, frontend submission or deployment yet. Phase 3 code is merged by request; runtime verification is still required.
