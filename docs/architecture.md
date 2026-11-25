# Architecture

Web and NestJS API are independent services; the worker is an independently deployed process built with the same npm dependencies. Shared TypeScript defines format compatibility, limits and queue contract.

Browser → signed upload to private temporary storage → API verifies object metadata → Redis/BullMQ → bounded ADVFX native/Blender import to GLB → optional glTF Transform optimization → temporary output → signed download.

Phase 3 reuses all existing 15 input routes to GLB; new imports/exports are deferred. Phase 5 adds compression while custom color is paused. Public conversion remains gated pending integration tests, production sandbox and benchmarking. Browser submission remains Phase 6. ADVFX production remains untouched.
