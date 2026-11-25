# Phase 5 — Compression (custom color paused)

Update: see [Phase 4A](phase-4a.md) for the new STL/OBJ/PLY and 3MF compressors and output-specific availability. The GLB details below remain applicable.

The existing ADVFX glTF Transform optimization logic is reused on the canonical GLB. There is no additional importer/exporter development. GLB → GLB allows same-format compression; other inputs convert to GLB first.

| Level | Optimization |
| --- | --- |
| None | Skip optimizer; use converted GLB (original bytes for valid GLB input). |
| Low | Meshopt, WebP texture compression, max texture dimension 2048 px, no simplification. |
| Medium | Same, max texture dimension 1024 px, no simplification. |
| High | Max texture dimension 512 px, static mesh simplification target ratio 0.3, error 0.001, lock borders. |

High skips simplification when animations, skinning or morph targets are detected. These are settings, not promised size reduction or geometry quality; mesh quantization and texture encoding can change appearance even without simplification. The optimizer uses one candidate, always generated from the converted base. If it is invalid, bigger, equal size, fails or exceeds the optimizer deadline, retain the base with a warning (unless the overall job deadline expired, in which case fail the job). No forced decimation for None/Low/Medium. 384 MiB default Node heap and 180-second optimizer timeout; V8/WASM allocations outside heap are constrained by the container memory limit, which must also be set in hosting.

Job status exposes originalBytes, convertedBytes, outputBytes, compressionApplied, compressionReductionPercent (relative to converted GLB), reductionPercent (relative to original upload), and warning. The latter may be negative because format conversion can increase size. Compression is not guaranteed to shrink every model. Signed URLs remain protected by the per-job token.

Custom model color UI is paused and non-null color requests are rejected. Original materials are retained as far as existing import/export and optimization support allows. Browser submission, real model preview for all formats, and download integration remain Phase 6.

## Testing

npm run smoke:conversion exercises all presets on a tiny STL and GLB passthrough / same-format compression. The tiny sample may legitimately retain the original; to prove actual reduction, use a suitable larger fixture:
```sh
SMOKE_MODEL_PATH=/absolute/path/to/model.glb SMOKE_COMPRESSION=Medium SMOKE_REQUIRE_REDUCTION=true npm run smoke:conversion
```
Repeat with Low and High, static and animated assets, and inspect visual quality. For all 15 formats use fixture paths and None first, then compression. Unit tests assert route eligibility, color rejection, preset settings and animation safety. No live build, Blender, glTF Transform or storage integration has been run in the ChatGPT execution environment. Public use remains disabled by default.
