# Phase 6 — Frontend, preview, progress and downloads

Browser-first conversion remains the default for eligible routes (see browser-first.md). Backend jobs are submitted with signed direct storage uploads; job token stays in memory. The UI displays upload progress, worker-stage progress, waiting position, observed wait estimate, output size, overall and baseline-relative reduction, warnings, and download actions.

## Queue estimates

The API samples up to 50 recent successful completed jobs from BullMQ (last hour), using finishedOn - processedOn, and estimates time until the waiting job STARTS by simulating worker availability and earlier waiting jobs. The median duration is used only when at least three valid samples and live worker heartbeats exist. Active-job elapsed times are accounted for approximately. Results are cached for 10 seconds per API process; no additional permanent data store. ETA is unavailable with insufficient observations or queue test mode. Mixed model sizes and workloads can make estimates inaccurate. It is not an ETA to finish.

## Preview

STL/OBJ/PLY geometry-only, and supported self-contained uncompressed GLB/GLTF triangle geometry, up to 10 MiB. A dedicated Web Worker prepares a sanitized geometry-only GLB: bounded vertices/triangles, valid accessor byte ranges and indices, finite positions/transforms, acyclic nodes, no external resources, no images, skins, animation or extensions in the preview representation. Three.js renders geometry with orbit, pan and zoom; preview normalization affects display only, not exported files. Unsupported material/geometry/extension content or large files show an unavailable message. No fake sample is shown for unsupported selected input. Preview is paused during conversion to reduce memory. Eligible outputs can be previewed explicitly after completion (bounded signed download for server result); no extra server conversion. R2/MinIO must allow GET CORS for server output preview; normal download remains available without preview.

## Recovery

One active job per page. Local cancellation terminates worker; unsubmitted or waiting server jobs can be cancelled. Active server cancellation is not supported. Status interruptions retry with backoff; after repeated failures, tracking pauses while retaining the existing session in memory. Resume uses the same session ID, and submit is idempotent, so it does not upload twice. Pause tracking does not cancel a server job. Forgetting the job or reloading loses access; existing temporary storage expiry applies. File/settings changes are blocked while active or resumable; user can explicitly forget tracking. Downloads obtain a fresh expiring URL when clicked.

## Developer verification

npm run test:browser (codec/preview regression cases), npm test (queue estimates and API contract), npm run build, npm run lint. Verify browser-only conversion with backend stopped; verify output preview and download, untrusted glTF rejection and memory limits, then start isolated server and verify upload/queue/result, disconnect/reconnect, pause/resume, and cancellation. After three successful jobs, enqueue multiple jobs and check estimate changes. Actual browser, worker and production integration verification remain release gates. No new dependency or branch. Custom color stays paused.
