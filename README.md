# Formshift — 3D File Workshop

Standalone 3D file converter. Phase 2 adds private temporary-storage upload sessions, Redis/BullMQ queue admission, job status/cancellation, and cleanup. No conversion worker is running; public job submission remains disabled.

## Layout

- apps/web: existing React/Vite interface and bounded local STL preview.
- apps/api: NestJS metadata, storage and queue API.
- apps/worker: worker contract for the next phase.
- packages/shared: format definitions and queue types.
- docs/phase-2.md: API, security, deployment and smoke-test instructions.

## Local development

Node.js 22.12+, Docker Compose.

```sh
npm run setup
cp .env.example .env
npm run infra:up
```

In separate terminals:

```sh
npm run dev:web
npm run dev:api
```

Web: http://localhost:5173. API: http://localhost:3001/api/health and /api/formats. For a local queue smoke test, set QUEUE_ACCEPT_JOBS=true before starting the API and run npm run smoke:queue. Reset to false for public deployments.

```sh
npm test
npm run build
npm run lint
```

The API lockfile must be refreshed by npm run setup and committed before deploying. The existing frontend lockfile is unchanged. See docs/phase-2.md for exact storage setup and limitations. Actual conversions, compression, exported color and real ETA remain Phase 3+.
