# Conversion worker — Phase 3

Independent BullMQ worker process and Docker image; one active job per replica. It uses the existing API dependency package and shared build so dependency versions are consistent. The compiled worker runs separately from NestJS and has no HTTP listener.

The default route is STL → GLB (compression None, original/default color). It uses the ADVFX native Python converter, with strict ASCII/binary STL validation, bounded streaming transfers, ETag checks, process-group timeout, Linux prlimit memory/CPU/file-size limits, GLB container verification and temporary directory cleanup. No Blender fallback on invalid inputs.

The ADVFX Blender and 3MF scripts are vendored, not advertised as operational. On a trusted Linux development machine only, WORKER_STL_ENGINE=blender may be used with Blender 4.5 installed to exercise the STL importer; not supported by the default Docker image. It is prohibited in production. No network namespace or per-job filesystem sandbox yet: do not expose arbitrary Blender/3MF/OBJ/USD inputs to the worker.

See docs/phase-3.md for setup, limits and end-to-end smoke test.
