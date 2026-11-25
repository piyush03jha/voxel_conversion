import type { ConversionJobData } from '../../../packages/shared/src/jobs'
import { MAX_UPLOAD_BYTES } from '../../../packages/shared/src/compatibility'
import { isWorkerRoute, COMPRESSION_LEVELS } from '../../../packages/shared/src/jobs'

export function checkJob(id: string | undefined, data: ConversionJobData, now = Date.now()) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('INVALID_JOB')
  if (!data || !isWorkerRoute(data.inputFormat, data.outputFormat) || !COMPRESSION_LEVELS.includes(data.compression) || data.color !== null) throw new Error('UNSUPPORTED_ROUTE')
  if (data.inputKey !== 'temporary/' + id + '/input.' + data.inputFormat.toLowerCase() || data.outputKey !== 'temporary/' + id + '/output.glb') throw new Error('INVALID_OBJECT_KEY')
  if (!Number.isSafeInteger(data.originalBytes) || data.originalBytes < 1 || data.originalBytes > MAX_UPLOAD_BYTES || typeof data.etag !== 'string' || !/^"[^"\r\n]{1,128}"$/.test(data.etag)) throw new Error('INVALID_METADATA')
  if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) throw new Error('EXPIRED_JOB')
}
