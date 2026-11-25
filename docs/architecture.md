# Architecture

Web and NestJS API are independent services; the worker is an independently deployed process built with the same npm dependencies. Shared TypeScript defines format compatibility, limits and queue contract.

Browser → signed upload to private temporary storage → API verifies object metadata → Redis/BullMQ → isolated job directory and bounded native converter → temporary output → signed download.

Phase 3 adds STL-to-GLB with the ADVFX native script, strict content preflight, worker heartbeats, one job per replica, and resource limits. Other importer scripts are ported but not enabled. Public admission stays disabled; see phase-3.md for security and testing gaps. ADVFX production remains untouched.
