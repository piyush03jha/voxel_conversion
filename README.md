# Formshift — 3D File Workshop

Standalone 3D file converter. Phase 3 adds the first STL-to-GLB conversion worker using the ADVFX native converter. Public job submission remains disabled pending verification.

## Layout

- apps/web: existing React/Vite interface and bounded local STL preview.
- apps/api: NestJS metadata, storage and queue API.
- apps/worker: independent conversion worker and vendored ADVFX scripts.
- packages/shared: format definitions and queue types.
- docs/phase-2.md and docs/phase-3.md: API, worker, security, deployment and smoke-test instructions.

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

The API lockfile must be refreshed by npm run setup and committed before deploying. The existing frontend lockfile is unchanged. See docs/phase-2.md for exact storage setup and limitations. Only STL to GLB with no optional processing is implemented. Additional formats, compression, exported color, real ETA and frontend submission remain pending.
