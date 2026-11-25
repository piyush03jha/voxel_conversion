import type { ModelFormat } from './compatibility'

export const QUEUE_NAME = 'model-conversion'
export const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const
export type CompressionLevel = (typeof COMPRESSION_LEVELS)[number]
export interface ConversionJobData {
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
}
