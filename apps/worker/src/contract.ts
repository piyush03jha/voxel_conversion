import type { ConversionJobData } from '../../../packages/shared/src/jobs'
import { MAX_UPLOAD_BYTES, getCompressionLevels } from '../../../packages/shared/src/compatibility'
import { jobOutputKey } from '../../../packages/shared/src/preview'
import { isWorkerRoute, COMPRESSION_LEVELS } from '../../../packages/shared/src/jobs'

export function checkJob(id: string | undefined, data: ConversionJobData, now = Date.now()) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('INVALID_JOB')
  if (!data || !isWorkerRoute(data.inputFormat, data.outputFormat) || !COMPRESSION_LEVELS.includes(data.compression) || !getCompressionLevels(data.outputFormat).includes(data.compression) || data.color !== null) throw new Error('UNSUPPORTED_ROUTE')
  if (data.purpose !== undefined && data.purpose !== 'preview' && data.purpose !== 'conversion') throw new Error('INVALID_PURPOSE')
  if (data.purpose === 'preview' && (data.outputFormat !== 'GLB' || data.compression !== 'None')) throw new Error('INVALID_PREVIEW')
  if (data.inputKey !== 'temporary/' + id + '/input.' + data.inputFormat.toLowerCase() || data.outputKey !== jobOutputKey(id, data.inputFormat, data.outputFormat, data.purpose)) throw new Error('INVALID_OBJECT_KEY')
  if (!Number.isSafeInteger(data.originalBytes) || data.originalBytes < 1 || data.originalBytes > MAX_UPLOAD_BYTES || typeof data.etag !== 'string' || !/^"[^"\r\n]{1,128}"$/.test(data.etag)) throw new Error('INVALID_METADATA')
  if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) throw new Error('EXPIRED_JOB')
}
