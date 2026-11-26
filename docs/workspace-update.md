# Conversion workspace and separate compression

- / is conversion only, always None compression. /compress is a separate tool that keeps the input format and offers Low/Medium/High for GLB, STL, OBJ, PLY and 3MF. Unsupported formats must first be converted to a compressible format. Legacy API requests can still specify compression with a different output for backward compatibility.
- Recommended output formats are editorial choices filtered by the compatibility matrix; same-format processing is omitted in the conversion UI and available on compression where supported. 3MF recommends STL, OBJ, GLB and PLY. Other compatible outputs are grouped separately. Recommendations do not guarantee conversion success.
- Larger responsive preview workspace keeps loaded input/output geometry and document previews visible during processing. Existing preview generation may continue; new server preview requests are disabled while conversion is active. Complex models still need an explicit server preview request; there is no fake model for unsupported input. Static sampled previews are not a complete fidelity inspection. Navigation to the other tool loads a new page and is disabled during a running or resumable job.
- Dense binary STL (>=30 MiB) to GLB/embedded GLTF streams coordinates without welding, preserving triangles and avoiding a huge vertex map. Output can be larger than welded geometry and original STL normals/nonstandard attributes are not retained. 3MF -> 3MF compression now repacks the existing ZIP entry contents, not a Blender mesh rebuild; retain the original if not smaller. For STL/OBJ/PLY same-format compression, a verified candidate must beat the original size and baseline or the original is retained.
- Default local worker container memory 3 GiB, native subprocess address space 1536 MiB, job timeout 15 minutes, 4.2 million triangles, expanded archive 1024 MiB, generated output 512 MiB. Upload cap remains 200 MiB. Existing .env values override defaults; update explicitly. Higher budgets increase host resource requirements; start one worker. Output previews that require an additional server job still have a 200 MiB source cap. Actual 3MF/FBX/USD geometry complexity and archive expansion can exceed safe limits even when compressed input is small. No unlimited Blender processes, no promise that every 200 MiB file converts.
- Upload signing default 30 minutes for new local env files; client uses actual signed upload expiry. Keep existing security and admission gates. Production deployment still requires validation and resource benchmarks.

## Local upgrade
```env
WORKER_CONTAINER_MEMORY=3g
WORKER_PROCESS_MEMORY_MB=1536
WORKER_TIMEOUT_MS=900000
WORKER_MAX_TRIANGLES=4200000
WORKER_MAX_ARCHIVE_MB=1024
WORKER_MAX_OUTPUT_MB=512
UPLOAD_URL_TTL_SECONDS=1800
```
Use one worker initially. Restart API and rebuild worker to apply. npm run test:large exercises the streamed STL route and 3MF repack in a bounded subprocess; LARGE_STL_TEST=1 npm run test:large uses a synthetic nearly 200 MiB STL. Also run npm test, npm run build, npm run lint and actual per-format server smoke tests. Vite serves /compress via SPA fallback; production static hosting needs the same fallback.
