import { safeBatchPath,validPackageOptions } from '../../../../packages/shared/src/batch'
import { isUploadSize } from '../../../../packages/shared/src/upload'
import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { ACCEPTED_FORMATS, getFormatFromFilename, isConversionSupported, getCompressionLevels } from '../../../../packages/shared/src/compatibility'
import type { ModelFormat } from '../../../../packages/shared/src/compatibility'
import { COMPRESSION_LEVELS } from '../../../../packages/shared/src/jobs'
import type { CompressionLevel } from '../../../../packages/shared/src/jobs'

export interface UploadRequest {
  bundleEntry?: string
  packageOutput?: boolean
  purpose?: 'preview' | 'conversion'
  inputFormat: ModelFormat
  outputFormat: ModelFormat
  originalBytes: number
  compression: CompressionLevel
  color: string | null
}

export function validateUpload(body: unknown): UploadRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Expected a JSON object')
  const b = body as Record<string, unknown>
  if (Object.keys(b).some((key) => !['filename', 'size', 'outputFormat', 'compression', 'color', 'purpose', 'bundleEntry','packageOutput'].includes(key))) throw new BadRequestException('Unknown upload field')
  if (typeof b.filename !== 'string' || b.filename.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(b.filename)) throw new BadRequestException('Invalid filename')
  const inputFormat = getFormatFromFilename(b.filename)
  if (!inputFormat) throw new BadRequestException('Unsupported input format')
  if (!isUploadSize(b.size)) throw new BadRequestException('Choose a non-empty file within the storage provider object-size limit')
  if (typeof b.outputFormat !== 'string' || !ACCEPTED_FORMATS.includes(b.outputFormat as ModelFormat) || !isConversionSupported(inputFormat, b.outputFormat as ModelFormat)) throw new BadRequestException('Unsupported output format')
  const compression = b.compression ?? 'None'
  if (!COMPRESSION_LEVELS.includes(compression as CompressionLevel) || (!b.bundleEntry&&!getCompressionLevels(b.outputFormat as ModelFormat).includes(compression as CompressionLevel))) throw new BadRequestException('Compression level is not supported for this output format')
  if(compression!=='None'&&inputFormat!==b.outputFormat)throw new BadRequestException('Compression must retain the input format; convert and compress separately')
  const color = b.color ?? null
  if (color !== null) throw new BadRequestException('Custom model color is paused')
  if (b.purpose !== undefined && b.purpose !== 'conversion' && b.purpose !== 'preview') throw new BadRequestException('Invalid job purpose')
  if (b.purpose === 'preview' && (b.outputFormat !== 'GLB' || compression !== 'None')) throw new BadRequestException('Invalid preview options')
  if(b.bundleEntry!==undefined&&(!safeBatchPath(b.bundleEntry)||getFormatFromFilename(b.bundleEntry)!==inputFormat))throw new BadRequestException('Invalid dependency bundle')
  if(b.packageOutput!==undefined&&typeof b.packageOutput!=='boolean')throw new BadRequestException('Invalid package output flag')
  if(!validPackageOptions(inputFormat,b.outputFormat as string,compression as string,b.purpose as string|undefined,b.bundleEntry as string|undefined,b.packageOutput===true))throw new BadRequestException('Invalid package operation')
  return { ...(b.packageOutput===true?{packageOutput:true}:{}), ...(typeof b.bundleEntry==='string'?{bundleEntry:b.bundleEntry}:{}), ...(b.purpose === 'preview' ? { purpose: 'preview' as const } : {}), inputFormat, outputFormat: b.outputFormat as ModelFormat, originalBytes: b.size, compression: compression as CompressionLevel, color: null }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
