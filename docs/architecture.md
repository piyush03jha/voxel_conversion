# Architecture

The web application and NestJS API are separate packages in one repository. The shared TypeScript module defines 15 candidate inputs, the initial GLB target, and the 200 MiB limit. The API currently serves health and format metadata only. All operational output pairs remain disabled. The worker directory documents the next milestone.

Planned flow: browser → API signed upload → temporary object storage → API job submission → Redis/BullMQ → isolated worker → temporary output → signed download. Redis stores metadata only. Two worker replicas with concurrency one are the initial target, subject to hosting capacity. Queue limit 100, retention, rate limits, validation, timeout and cleanup must be implemented before public conversion is enabled.

ADVFX remains independent and unmodified. Reuse its Blender importer, dense mesh and 3MF scripts, optimization logic, and viewer patterns. Do not claim 225 supported conversions without validating each pair.
