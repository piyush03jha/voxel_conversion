import { createHash } from 'node:crypto'
import { BadRequestException } from '@nestjs/common'
import { ACCEPTED_FORMATS, getFormatFromFilename, isConversionSupported, MAX_UPLOAD_BYTES, getCompressionLevels } from '../../../../packages/shared/src/compatibility'
import type { ModelFormat } from '../../../../packages/shared/src/compatibility'
import { COMPRESSION_LEVELS } from '../../../../packages/shared/src/jobs'
import type { CompressionLevel } from '../../../../packages/shared/src/jobs'

export interface UploadRequest {
  inputFormat: ModelFormat
  outputFormat: ModelFormat
  originalBytes: number
  compression: CompressionLevel
  color: string | null
}

export function validateUpload(body: unknown): UploadRequest {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Expected a JSON object')
  const b = body as Record<string, unknown>
  if (Object.keys(b).some((key) => !['filename', 'size', 'outputFormat', 'compression', 'color'].includes(key))) throw new BadRequestException('Unknown upload field')
  if (typeof b.filename !== 'string' || b.filename.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(b.filename)) throw new BadRequestException('Invalid filename')
  const inputFormat = getFormatFromFilename(b.filename)
  if (!inputFormat) throw new BadRequestException('Unsupported input format')
  if (typeof b.size !== 'number' || !Number.isSafeInteger(b.size) || b.size < 1 || b.size > MAX_UPLOAD_BYTES) throw new BadRequestException('File must be between 1 byte and 200 MiB')
  if (typeof b.outputFormat !== 'string' || !ACCEPTED_FORMATS.includes(b.outputFormat as ModelFormat) || !isConversionSupported(inputFormat, b.outputFormat as ModelFormat)) throw new BadRequestException('Unsupported output format')
  const compression = b.compression ?? 'None'
  if (!COMPRESSION_LEVELS.includes(compression as CompressionLevel) || !getCompressionLevels(b.outputFormat as ModelFormat).includes(compression as CompressionLevel)) throw new BadRequestException('Compression level is not supported for this output format')
  const color = b.color ?? null
  if (color !== null) throw new BadRequestException('Custom model color is paused')
  return { inputFormat, outputFormat: b.outputFormat as ModelFormat, originalBytes: b.size, compression: compression as CompressionLevel, color: null }
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
