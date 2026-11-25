# Conversion worker (planned)

The next milestone will port the ADVFX Python/Blender import and optimization scripts. Workers will consume a single Redis/BullMQ queue with concurrency 1 per replica, resource limits and isolated temporary directories. No worker is active yet.
