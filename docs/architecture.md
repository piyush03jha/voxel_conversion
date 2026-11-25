# Architecture

Web and NestJS API are independent services; the worker is an independently deployed process built with the same npm dependencies. Shared TypeScript defines format compatibility, limits and queue contract.

Browser → signed upload to private temporary storage → API verifies object metadata → Redis/BullMQ → bounded ADVFX native/Blender import → selected exporter → optional format-specific optimization → temporary output → signed download.

Phase 3 reuses all 15 existing input routes. Phase 4A adds selected exporters for the original formats; completely new formats are deferred. Phase 5 adds format-specific compression while custom color is paused. Public conversion remains gated pending integration tests, production sandbox and benchmarking. Browser submission remains Phase 6. ADVFX production remains untouched.
