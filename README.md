# Formshift — 3D File Workshop

Standalone 3D file converter. Phase 3 integrates existing ADVFX imports. Phase 4A adds compatible selected-format exporters for the original 15 formats. Phase 5 adds format-specific compression. New formats and custom color are deferred. Public job submission remains disabled pending verification.

## Layout

- apps/web: existing React/Vite interface and bounded local STL preview.
- apps/api: NestJS metadata, storage and queue API.
- apps/worker: independent conversion worker and vendored ADVFX scripts.
- packages/shared: format definitions and queue types.
- docs/phase-2.md, docs/phase-3.md and docs/phase-5.md: API, worker, security, deployment and smoke-test instructions.

## Local development

Node.js 22.12+, Docker Compose.

```sh
npm run setup
cp -n .env.example .env
npm run infra:up
```

If you already have a .env from Phase 1, add the new variables from .env.example rather than overwriting it.

In separate terminals:

```sh
npm run dev:web
npm run dev:api
```

Web: http://localhost:5173. API: http://localhost:3001/api/health and /api/formats. For a local conversion smoke test, set QUEUE_ACCEPT_JOBS=true and QUEUE_TEST_MODE=false, then run npm run worker:up and npm run smoke:conversion. See docs/phase-3.md. Reset to false for public deployments.

```sh
npm test
npm run build
npm run lint
```

The API lockfile must be refreshed by npm run setup and committed before deploying. The existing frontend lockfile is unchanged. See docs/phase-2.md for exact storage setup and limitations. The original 15 formats are represented as input/output targets through 188 candidate pairs; runtime verification is pending. See docs/phase-4a.md for limitations and per-format smoke testing. New formats, custom color, real ETA and frontend submission remain deferred. Public admission requires explicit approval and a working sandbox. See docs/phase-3.md and docs/phase-5.md.

## Hybrid browser-first processing

See [browser-first routing and frontend integration](docs/browser-first.md). Eligible geometry and glTF repacking jobs execute locally; other conversions use the server. Run npm run test:browser for the codec regression suite. Runtime verification remains required.
