import { ACCEPTED_FORMATS } from './compatibility'
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
  convertedBytes: number
  compressionApplied: boolean
  warning: string | null
}

export const WORKER_HEARTBEATS = 'formshift:worker-heartbeats:v2'
export const ACTIVE_INPUTS = ACCEPTED_FORMATS
export function isWorkerRoute(input: string, output: string): boolean {
  return ACTIVE_INPUTS.some((format) => format === input) && output === 'GLB'
}
