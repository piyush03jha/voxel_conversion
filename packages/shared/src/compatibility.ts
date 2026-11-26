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
  if (output === 'SVG' || output === 'PDF') return '2D document conversion only; PDF to SVG uses the first page. Same-format documents are returned unchanged, not sanitized.'
  if (['USD', 'USDA', 'USDC', 'USDZ'].includes(output)) return 'Single-file USD export; materials and external textures are omitted, and unsupported scene features may be lost.'
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

/** Editorial recommendations by common downstream use, not measured conversion success rates. */
const RECOMMENDED: Record<ModelFormat, readonly ModelFormat[]> = {
  STL: ['3MF','OBJ','GLB','PLY'],
  OBJ: ['GLB','FBX','STL','GLTF'],
  FBX: ['GLB','OBJ','GLTF','USDZ'],
  GLB: ['GLTF','USDZ','FBX','OBJ'],
  GLTF: ['GLB','USDZ','FBX','OBJ'],
  '3MF': ['STL','OBJ','GLB','PLY'],
  PLY: ['STL','OBJ','GLB','3MF'],
  USD: ['USDC','USDZ','GLB','FBX'],
  USDA: ['USDC','USDZ','GLB','USD'],
  USDC: ['USDA','USDZ','GLB','USD'],
  USDZ: ['GLB','USD','USDC','GLTF'],
  ABC: ['GLB','FBX','OBJ','USD'],
  BVH: ['FBX','GLB','GLTF'],
  SVG: ['PDF','STL','GLB','OBJ'],
  PDF: ['SVG','GLB','STL','OBJ'],
}
export function getOutputGroups(input:ModelFormat){
  const allowed=getSupportedOutputs(input).filter(output=>output!==input)
  const recommended=RECOMMENDED[input].filter(output=>allowed.includes(output))
  return {recommended,other:allowed.filter(output=>!recommended.includes(output))}
}
export const FORMAT_USE: Record<ModelFormat,string> = {
  STL:'3D printing',OBJ:'Mesh exchange',FBX:'3D apps & games',GLB:'Web & 3D viewing',GLTF:'Web assets',
  '3MF':'3D printing package',PLY:'Scans & meshes',USD:'Scene exchange',USDA:'Text USD',USDC:'Binary USD',USDZ:'Apple AR',
  ABC:'Geometry cache',BVH:'Skeleton motion',SVG:'Vector artwork',PDF:'Document',
}
