export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

export const ACCEPTED_FORMATS = [
  'STL',
  'OBJ',
  'FBX',
  'GLB',
  'GLTF',
  '3MF',
  'PLY',
  'USD',
  'USDA',
  'USDC',
  'USDZ',
  'ABC',
  'BVH',
  'SVG',
  'PDF',
] as const

export type ModelFormat = (typeof ACCEPTED_FORMATS)[number]

// Existing formats only. BVH requires an armature; SVG/PDF are 2D document routes.
export const SCENE_OUTPUTS = ['GLB', 'STL', 'OBJ', 'FBX', 'GLTF', '3MF', 'PLY', 'USD', 'USDA', 'USDC', 'USDZ', 'ABC'] as const
const SKELETAL_INPUTS: readonly ModelFormat[] = ['FBX', 'GLB', 'GLTF', 'BVH']
const VECTOR_INPUTS: readonly ModelFormat[] = ['SVG', 'PDF']
const SUPPORTED_OUTPUTS = Object.fromEntries(ACCEPTED_FORMATS.map((input) => [
  input, [...SCENE_OUTPUTS, ...(SKELETAL_INPUTS.includes(input) ? ['BVH'] : []),
    ...(VECTOR_INPUTS.includes(input) ? ['SVG', 'PDF'] : [])],
])) as unknown as Record<ModelFormat, readonly ModelFormat[]>

export const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const
export type CompressionLevel = (typeof COMPRESSION_LEVELS)[number]
export function getCompressionLevels(output: ModelFormat): readonly CompressionLevel[] {
  return (['GLB', 'STL', 'OBJ', 'PLY', '3MF'] as readonly ModelFormat[]).includes(output)
    ? COMPRESSION_LEVELS : ['None']
}
export function getOutputWarning(output: ModelFormat): string | null {
  if (output === 'OBJ') return 'Single-file OBJ geometry, UVs and normals; no MTL or textures. Animation is not preserved.'
  if (output === 'STL' || output === 'PLY' || output === '3MF') return 'Static mesh export; animation and most materials are not preserved.'
  if (output === 'BVH') return 'Requires exactly one compatible armature; exports skeleton motion only.'
  if (output === 'SVG' || output === 'PDF') return '2D document conversion only; PDF to SVG uses the first page.'
  if (['USD', 'USDA', 'USDC', 'USDZ'].includes(output)) return 'Single-file USD export; external textures and unsupported scene features may be omitted.'
  if (output === 'ABC') return 'Baked geometry/cache export; materials and rig structure may be lost.'
  return null
}

export function getFormatFromFilename(filename: string): ModelFormat | null {
  const dot = filename.lastIndexOf('.')
  if (dot <= 0 || dot === filename.length - 1) return null
  const extension = filename.slice(dot + 1).toUpperCase()
  return ACCEPTED_FORMATS.find((format) => format === extension) ?? null
}

export function isConversionSupported(
  input: ModelFormat,
  output: ModelFormat,
): boolean {
  return SUPPORTED_OUTPUTS[input].includes(output)
}

export function getSupportedOutputs(input: ModelFormat): readonly ModelFormat[] {
  return SUPPORTED_OUTPUTS[input]
}

export const CONVERSION_AVAILABLE = false
