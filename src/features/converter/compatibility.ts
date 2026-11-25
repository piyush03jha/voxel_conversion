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
  const extension = filename.split('.').pop()?.toUpperCase()
  return ACCEPTED_FORMATS.find((format) => format === extension) ?? null
}

export function isConversionSupported(
  input: ModelFormat,
  output: ModelFormat,
): boolean {
  return SUPPORTED_OUTPUTS[input].includes(output)
}
