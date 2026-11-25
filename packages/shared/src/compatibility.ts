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

const SUPPORTED_OUTPUTS: Record<ModelFormat, readonly ModelFormat[]> = {
  STL: ['GLB'],
  OBJ: ['GLB'],
  FBX: ['GLB'],
  GLB: ['GLB'],
  GLTF: ['GLB'],
  '3MF': ['GLB'],
  PLY: ['GLB'],
  USD: ['GLB'],
  USDA: ['GLB'],
  USDC: ['GLB'],
  USDZ: ['GLB'],
  ABC: ['GLB'],
  BVH: ['GLB'],
  SVG: ['GLB'],
  PDF: ['GLB'],
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
