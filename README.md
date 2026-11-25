# Formshift — 3D File Workshop

Standalone 3D conversion and compression project. Phase 1 preserves the existing responsive frontend, adds a local STL preview (up to 10 MiB), and initializes a NestJS metadata API. Actual conversion is not implemented.

## Layout

- `apps/web`: React/Vite application (existing lockfile preserved).
- `apps/api`: NestJS API.
- `apps/worker`: future isolated Blender/Python conversion service.
- `packages/shared`: shared format definitions and limits.
- `docs`: architecture and next steps.

## Development

Use Node.js 22.12+ (a supported LTS release is recommended). Each application has its own npm dependency installation to preserve the existing web lockfile and allow independent deployments.

```sh
npm run setup
cp .env.example .env
```

In separate terminals:

```sh
npm run dev:web
npm run dev:api
```

Web: http://localhost:5173. API: http://localhost:3001/api/health and /api/formats. The Vite development proxy forwards /api to the default API port. If changing the API port, update the proxy or configure VITE_API_BASE_URL. The API's first install generates apps/api/package-lock.json; commit that lockfile before deploying.

```sh
npm run build
npm run lint
npm test
```

## Current limitations

- Files stay local in the browser. No upload, queue, worker, conversion, compression, exported color, or download endpoints yet.
- STL files up to 10 MiB have a local preview; other files show an explicitly labeled sample. The planned upload limit is 200 MiB.
- All 15 inputs have GLB as a planned target, not an operational conversion. Original colors are the default setting.
- Next: temporary object storage, Redis/BullMQ, ADVFX importer port, process limits and actual conversion. See docs/architecture.md.
