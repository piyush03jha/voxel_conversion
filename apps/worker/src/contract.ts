import type { ConversionJobData } from '../../../packages/shared/src/jobs'
import { safeBatchPath,bundleInputKey,validPackageOptions } from '../../../packages/shared/src/batch'
import { getFormatFromFilename,getCompressionLevels } from '../../../packages/shared/src/compatibility'
import { isUploadSize } from '../../../packages/shared/src/upload'
import { jobOutputKey } from '../../../packages/shared/src/preview'
import { isWorkerRoute, COMPRESSION_LEVELS } from '../../../packages/shared/src/jobs'

export function checkJob(id: string | undefined, data: ConversionJobData, now = Date.now()) {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new Error('INVALID_JOB')
  if (!data || !isWorkerRoute(data.inputFormat, data.outputFormat) || !COMPRESSION_LEVELS.includes(data.compression) || (!data.bundleEntry&&!getCompressionLevels(data.outputFormat).includes(data.compression)) || data.color !== null) throw new Error('UNSUPPORTED_ROUTE')
  if(data.compression!=='None'&&data.inputFormat!==data.outputFormat)throw new Error('UNSUPPORTED_ROUTE')
  if (data.purpose !== undefined && data.purpose !== 'preview' && data.purpose !== 'conversion') throw new Error('INVALID_PURPOSE')
  if (data.purpose === 'preview' && (data.outputFormat !== 'GLB' || data.compression !== 'None')) throw new Error('INVALID_PREVIEW')
  if(data.bundleEntry!==undefined&&(!safeBatchPath(data.bundleEntry)||getFormatFromFilename(data.bundleEntry)!==data.inputFormat))throw new Error('INVALID_BUNDLE')
  if(data.packageOutput!==undefined&&typeof data.packageOutput!=='boolean'||!validPackageOptions(data.inputFormat,data.outputFormat,data.compression,data.purpose,data.bundleEntry,data.packageOutput===true))throw new Error('INVALID_PACKAGE')
  if (data.inputKey !== bundleInputKey(id,data.inputFormat,data.bundleEntry) || data.outputKey !== jobOutputKey(id, data.inputFormat, data.outputFormat, data.purpose,data.packageOutput)) throw new Error('INVALID_OBJECT_KEY')
  if (!isUploadSize(data.originalBytes) || typeof data.etag !== 'string' || !/^"[^"\r\n]{1,128}"$/.test(data.etag)) throw new Error('INVALID_METADATA')
  if (!Number.isSafeInteger(data.expiresAt) || data.expiresAt <= now) throw new Error('EXPIRED_JOB')
}
