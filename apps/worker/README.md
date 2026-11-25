# Conversion worker (Phase 3)

Consume the shared BullMQ queue `model-conversion` using the same REDIS_URL and queue prefix (BullMQ default). The contract is in packages/shared/src/jobs.ts. Each replica must use concurrency 1, attempts 1, and an isolated temporary directory.

Validate expiry before processing, stream the input from private storage using its expected ETag (If-Match), check the actual byte count and content/archives, then run bounded conversion. Write output only to the supplied outputKey. Return { outputBytes } only after a successful upload. Never expose raw exception messages to users. Cleanup local files on every path. The API will not remove a locked active job; worker must enforce expiry and timeout. Input/output object deletion is handled by API expiry sweeps plus bucket lifecycle. No worker is active in Phase 2.
