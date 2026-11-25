# Phase 6A — Browser-first hybrid converter

This is an explicit scope change: perform eligible conversions locally; use the existing worker infrastructure for other jobs. No new npm dependency or new format.

## Routing

- Browser candidates: STL, OBJ, PLY → STL/OBJ/PLY/GLB/GLTF; GLB/GLTF → GLB/GLTF. None compression only. Input at most 10 MiB, 200,000 triangles and 600,000 vertices for geometry-only conversion; generated output at most 50 MiB. Web Worker, 30-second deadline, one active job per page. These are conservative initial limits, not the server upload limit.
- Content must be supported: binary/strict ASCII STL without attribute-color extensions; triangle-only position OBJ without MTL, UV or normal indices; simple xyz/triangle PLY (ASCII or little-endian binary); self-contained single-buffer glTF 2.0 with bufferView images, no external URIs. Geometry outputs do not preserve original normals/smoothing/advanced features. GLB/GLTF repacking retains JSON/binary content subject to structural checks, and same-format retains original bytes.
- Server: other compatible pairs, compression requests, larger files (up to 200 MiB), advanced geometry/materials, unsupported local data. The browser first attempts eligible content, and if it cannot process it, displays a separate explicit "Upload and convert on server instead" button. No automatic file upload from a failed browser attempt.
- Browser route works even when API is unavailable. Server route requires health.conversionAvailable. Backend admission, validation, signed storage and resource limits are unchanged. Model color remains paused.

## UI

Select source and target → automatic engine label → local worker or signed upload → submit → poll queue/progress/status → download. Browser output is a Blob; download uses a temporary object URL. Server downloads request a signed URL only when clicked. Credentials remain in component memory, never localStorage or URL parameters. Switching files/settings clears previous results. Local cancellation terminates the worker; server cancellation only works for unsubmitted/waiting jobs. Active cancellation is not supported; a rejected cancellation leaves tracking running. Closing/reloading the page loses the job token; objects expire under the existing retention policy. ETA remains unavailable until actual processing statistics exist.

## Verification

Run npm run test:browser from root (dependency-free codec tested via installed TypeScript and Node). This covers 15 geometry conversion paths, axis round trips, embedded GLB/GLTF, malformed inputs and routing. Browser UI smoke test: run npm run dev:web with API stopped; choose a small STL and convert to OBJ/GLB/PLY/GLTF; inspect network for no model upload. Try textured OBJ and verify explicit fallback only. Check local cancellation and download. Then start API/storage/workers, enable isolated local queue, and test a backend-only conversion, progress, cancellation, failure and signed download. Existing 188 candidate pairs are not all runtime verified. Full build and browser/worker infrastructure tests are release gates; production queue stays disabled by default.
