# Formshift — 3D File Workshop

An independent 3D conversion and compression project. The current milestone is a responsive React/Vite interface with upload validation, a format compatibility map, and an interactive sample viewport. Conversion requests are not sent anywhere yet; the API, queue, storage, and worker services are the next milestone.

## Development

```sh
npm install
npm run dev
```

Run the production build with `npm run build`.

## Compatibility in this starter

The interface accepts STL, OBJ, FBX, GLB, GLTF, 3MF, PLY, USD, USDA, USDC, USDZ, ABC, BVH, SVG, and PDF inputs up to 200 MiB. GLB is the only enabled output. This intentionally matches the current ADVFX worker pipeline, which imports those formats and writes a canonical GLB; this does not imply every pairwise format conversion is supported.

The conversion service should reuse the independently implemented Blender importer/exporter and mesh optimization logic from [ADVFX](https://github.com/piyush03jha/ADVFX), rather than link this project to or modify that production repository. The source viewer uses React Three Fiber / Drei, also used by ADVFX. Review and port only the necessary files into this project when implementing the worker.

## Planned service boundaries

- **Web:** React, TypeScript, Vite, Tailwind CSS, and Three.js.
- **API:** NestJS; validate requests, issue temporary storage URLs, and enqueue conversion metadata.
- **Queue:** Redis and BullMQ, with bounded capacity and worker concurrency.
- **Worker:** Python/Blender conversion in an isolated temporary directory, timeouts, resource limits, and cleanup.
- **Storage:** temporary object storage with expiring downloads and automatic deletion.

Do not upload models into Redis or buffer full uploads in API memory. Keep infrastructure configuration in environment variables. Queue position and wait estimates must come from the live queue and processing statistics, not UI placeholders.

## Known limitations

- The API and worker are not connected; upload selection is local browser state only.
- The viewport is an interactive sample scene, not a preview of the selected file.
- Queue position, ETA, output size, and compression results are not available yet.
- Compression and color controls are UI state only; no output file is created.
- GLB-only output is the only advertised conversion target until each additional exporter is implemented and tested.
