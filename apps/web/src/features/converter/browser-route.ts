import type { ModelFormat, CompressionLevel } from './compatibility'
import { isConversionSupported } from './compatibility'

export const LOCAL_MAX_BYTES = 10 * 1024 * 1024
export const LOCAL_MAX_TRIANGLES = 200000
const mesh = ['STL', 'OBJ', 'PLY']
const meshOutputs = [...mesh, 'GLB', 'GLTF']

export function browserRoute(input: ModelFormat, output: ModelFormat, bytes: number, compression: CompressionLevel): boolean {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > LOCAL_MAX_BYTES || compression !== 'None' || !isConversionSupported(input, output)) return false
  if (typeof Worker === 'undefined') return false
  return (mesh.includes(input) && meshOutputs.includes(output)) ||
    (['GLB', 'GLTF'].includes(input) && ['GLB', 'GLTF'].includes(output))
}
export function outputName(filename: string, target: ModelFormat) {
  return filename.replace(/\.[^.]+$/, '') + '.' + target.toLowerCase()
}
