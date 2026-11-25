import { resolve } from 'node:path'
import { MAX_UPLOAD_BYTES } from '../../../packages/shared/src/compatibility'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error('Missing ' + name)
  return value
}
function int(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid ' + name)
  return value
}
export function workerConfig() {
  const endpoint = required('STORAGE_ENDPOINT')
  const parsed = new URL(endpoint)
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', 'minio'].includes(parsed.hostname))) throw new Error('Unsafe storage endpoint')
  const engine = process.env.WORKER_STL_ENGINE ?? 'native'
  if (engine !== 'native' && engine !== 'blender') throw new Error('Invalid WORKER_STL_ENGINE')
  if (engine === 'blender' && process.env.NODE_ENV === 'production') throw new Error('Blender route is not approved for public processing')
  return {
    redisUrl: required('REDIS_URL'), endpoint, bucket: required('STORAGE_BUCKET'),
    region: process.env.STORAGE_REGION ?? 'auto',
    accessKeyId: required('STORAGE_ACCESS_KEY_ID'), secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
    engine, scriptsDir: resolve(process.env.WORKER_SCRIPTS_DIR ?? '../worker/scripts'),
    workRoot: resolve(process.env.WORKER_TEMP_DIR ?? '/tmp'),
    timeoutMs: int('WORKER_TIMEOUT_MS', 600000, 10000, 900000),
    memoryMb: int('WORKER_PROCESS_MEMORY_MB', 768, 128, 4096),
    maxOutputBytes: int('WORKER_MAX_OUTPUT_MB', 200, 1, 200) * 1024 * 1024,
    maxInputBytes: MAX_UPLOAD_BYTES,
    maxTriangles: int('WORKER_MAX_TRIANGLES', 4000000, 1, 4200000),
    maxCells: int('WORKER_MAX_CELLS', 1500000, 1000, 3000000),
    threads: int('WORKER_THREADS', 1, 1, 4),
    python: process.env.PYTHON_BIN ?? 'python3',
    blender: process.env.BLENDER_BIN ?? 'blender',
  }
}
export type WorkerConfig = ReturnType<typeof workerConfig>
