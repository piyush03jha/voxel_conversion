import { ACCEPTED_FORMATS, isConversionSupported } from './compatibility'
import type { ModelFormat } from './compatibility'

export const QUEUE_NAME = 'model-conversion'
export { COMPRESSION_LEVELS } from './compatibility'
export type { CompressionLevel } from './compatibility'
import type { CompressionLevel } from './compatibility'
export interface ConversionJobData {
  purpose?: 'preview' | 'conversion'
  inputKey: string
  outputKey: string
  inputFormat: ModelFormat
  outputFormat: ModelFormat
  originalBytes: number
  compression: CompressionLevel
  color: string | null
  etag: string
  expiresAt: number
}
export interface ConversionJobResult {
  outputBytes: number
  convertedBytes: number
  compressionApplied: boolean
  warning: string | null
}

export const WORKER_HEARTBEATS = 'formshift:worker-heartbeats:v5'
export const ACTIVE_INPUTS = ACCEPTED_FORMATS
export function isWorkerRoute(input: string, output: string): boolean {
  return ACTIVE_INPUTS.some((format) => format === input) && ACTIVE_INPUTS.some((format) => format === output) && isConversionSupported(input as ModelFormat, output as ModelFormat)
}
