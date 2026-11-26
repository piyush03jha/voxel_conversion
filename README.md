# Formshift — 3D File Workshop

Standalone 3D file converter. Phase 3 integrates existing ADVFX imports. Phase 4A adds compatible selected-format exporters for the original 15 formats. Phase 5 adds format-specific compression. New formats and custom color are deferred. Public job submission remains disabled pending verification.

## Layout

- apps/web: existing React/Vite interface and bounded local STL preview.
- apps/api: NestJS metadata, storage and queue API.
- apps/worker: independent conversion worker and vendored ADVFX scripts.
- packages/shared: format definitions and queue types.
- docs/phase-2.md, docs/phase-3.md and docs/phase-5.md: API, worker, security, deployment and smoke-test instructions.

## Local development

Node.js 22.12+, Docker Compose v2. Local storage now uses SeaweedFS (MinIO images were removed from Docker Hub). Existing local .env endpoint and credentials still work.

```sh
npm run setup
cp -n .env.example .env
npm run infra:up
# Wait for storage-init to pass the S3 compatibility checks.
```

If you already have a .env from Phase 1, add the new variables from .env.example rather than overwriting it.

In separate terminals:

```sh
npm run dev:web
npm run dev:api
```

Storage logs: docker compose logs storage storage-init. Local S3: http://127.0.0.1:9000 (no MinIO console). Web: http://localhost:5173. API: http://localhost:3001/api/health and /api/formats. For a local conversion smoke test, set QUEUE_ACCEPT_JOBS=true and QUEUE_TEST_MODE=false, then run npm run worker:up and npm run smoke:conversion. See docs/phase-3.md. Reset to false for public deployments.

```sh
npm test
npm run build
npm run lint
```

The API lockfile must be refreshed by npm run setup and committed before deploying. The existing frontend lockfile is unchanged. See docs/phase-2.md for exact storage setup and limitations. The original 15 formats are represented as input/output targets through 188 candidate pairs; runtime verification is pending. See docs/phase-4a.md for limitations and per-format smoke testing. New formats, custom color, real ETA and frontend submission remain deferred. Public admission requires explicit approval and a working sandbox. See docs/phase-3.md and docs/phase-5.md.

## Hybrid browser-first processing

See [browser-first routing and frontend integration](docs/browser-first.md). Eligible geometry and glTF repacking jobs execute locally; other conversions use the server. Run npm run test:browser for the codec regression suite. Runtime verification remains required.

Phase 6 UI, bounded model preview, measured queue wait estimation, and resumable status tracking are documented in [Phase 6](docs/phase-6.md). Server output preview requires GET CORS on temporary storage. Runtime verification remains pending.

All 15 formats have preview routes; see [all-format preview](docs/preview-all-formats.md). Server previews are optional, bounded and separate from conversion results.

See [local infrastructure troubleshooting](docs/local-infra.md) for the MinIO replacement, startup checks and migration notes.

See [workspace update](docs/workspace-update.md) for the separate /compress tool, format recommendations, persistent viewer and large-file worker settings.

Large-upload update: [ADVFX-based multipart uploads and resource sizing](docs/large-uploads.md). No fixed application input size cap; provider, shared storage budget, disk and format constraints still apply.

Batch tools: [/batch](/batch) and [/compress/batch](/compress/batch). See [batch processing](docs/batch-processing.md) for capabilities, resource limits and local tests. Conversion and compression are separate API operations; no combined format change and optional compression.

Single-model folders and ZIP packages: [/package](/package), [/compress/package](/compress/package). See [model packages](docs/model-packages.md).