# Phase 4A — Existing format output selection

No new formats beyond the original fifteen. The shared matrix has 188 candidate pairs of 225, not 188 verified conversions. All fifteen are represented as output targets. Model content and memory limits can make an otherwise compatible pair fail.

- Twelve general scene targets: GLB, STL, OBJ, FBX, GLTF, 3MF, PLY, USD, USDA, USDC, USDZ, ABC.
- BVH: input FBX/GLB/GLTF/BVH only; exactly one compatible armature is required, skeleton-only output.
- SVG/PDF: input SVG/PDF only for 2D output. PDF → SVG is first page; SVG → PDF uses librsvg. Same-format document processing returns original bytes without sanitization.
- Direct Blender import/export for non-GLB scene outputs except GLTF. GLTF is embedded from the verified GLB binary chunk with streaming Base64, because Blender 4.x removed embedded glTF export. GLB keeps the existing native/Blender import strategy.
- OBJ is geometry/UV/normals only (no MTL sidecar). STL, PLY and 3MF are static meshes. 3MF is a core geometry-only package, no guarantee of printability, no materials/texture/animation support; unitless imported scenes assume Blender unit scale. USD materials omitted to avoid external textures. ABC is a geometry cache. USD/FBX/ABC animation fidelity depends on the importer/exporter. Output validation checks container signatures, not complete semantic correctness.

Compression options are format-specific: GLB retains existing optimizer, STL/OBJ/PLY support static mesh decimation (0.85/0.60/0.30 targets) and 3MF supports ZIP levels 1/6/9. Others only None. If a candidate is invalid, not generated or not smaller than the baseline export, retain baseline if the exporter completed successfully. Failed/timeout/OOM export processes fail safely. Compression percentages are measured against the baseline of the selected format, and overall reduction against source. No guaranteed reduction or preservation of exact original geometry/materials.

API validates requested pair and compression level; job contract and signed downloads use the selected extension. Frontend dropdown reflects shared matrix, disables unavailable compression presets and warns of loss. Browser upload/submission remains Phase 6.

## Test
Run npm run setup, npm run infra:up, npm run worker:up, npm run dev:api with isolated local settings (see phase-3.md). Restart all workers together; heartbeat version changed.
```sh
npm run test:export
npm run test:native
npm test
npm run build
npm run lint
SMOKE_OUTPUT_FORMAT=STL npm run smoke:conversion
SMOKE_OUTPUT_FORMAT=OBJ npm run smoke:conversion
SMOKE_OUTPUT_FORMAT=3MF npm run smoke:conversion
SMOKE_OUTPUT_FORMAT=GLTF npm run smoke:conversion
SMOKE_MODEL_PATH=/absolute/path/to/rig.fbx SMOKE_OUTPUT_FORMAT=BVH npm run smoke:conversion
SMOKE_MODEL_PATH=/absolute/path/to/vector.svg SMOKE_OUTPUT_FORMAT=PDF npm run smoke:conversion
```
Repeat for every compatible format with appropriate fixtures. Test static/animated materials, external references, round-trip readers, geometry fidelity, signed storage, malformed input, resource limits and 200 MiB models. No live Blender/Docker/Redis testing in the authoring environment. Keep public job admission disabled until all required verification and isolation are complete.
