# Architecture

Web and NestJS API are independent packages; shared TypeScript defines format compatibility, limits, and the queue contract.

Flow: browser requests a signed upload → private temporary object storage (direct PUT) → API verifies object metadata → shared Redis/BullMQ queue → isolated worker (Phase 3) → temporary output → signed download.

Phase 2 implements the API-side queue and storage lifecycle; all conversion output pairs remain disabled and job admission is off by default. Two worker replicas with concurrency one are planned, subject to hosting resources. No model bytes are stored in Redis or buffered by the API. See phase-2.md for configuration, safety boundaries, and integration tests.

ADVFX remains independent and unmodified. Reuse its import and optimization code in the next phase.
