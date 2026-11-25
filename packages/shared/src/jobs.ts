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

export const WORKER_HEARTBEATS = 'formshift:worker-heartbeats:v1'
export const ACTIVE_INPUTS = ['STL'] as const
export function isWorkerRoute(input: string, output: string): boolean {
  return input === 'STL' && output === 'GLB'
}
