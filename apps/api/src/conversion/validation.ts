import { BadRequestException } from '@nestjs/common'
import { ACCEPTED_FORMATS, getFormatFromFilename, isConversionSupported, MAX_UPLOAD_BYTES } from '../../../../packages/shared/src/compatibility'
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
  if (!COMPRESSION_LEVELS.includes(compression as CompressionLevel)) throw new BadRequestException('Invalid compression level')
  const color = b.color ?? null
  if (color !== null && (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) throw new BadRequestException('Invalid HEX color')
  return { inputFormat, outputFormat: b.outputFormat as ModelFormat, originalBytes: b.size, compression: compression as CompressionLevel, color: color === null ? null : (color as string).toLowerCase() }
}

export function tokenHash(token: string): string {
  return require('node:crypto').createHash('sha256').update(token).digest('hex') as string
}
