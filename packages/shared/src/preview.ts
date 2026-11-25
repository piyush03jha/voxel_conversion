import type { ModelFormat } from './compatibility'
export const PREVIEW_MAX_BYTES = 10 * 1024 * 1024
export const PREVIEW_MAX_TRIANGLES = 100000
export type PreviewKind = 'GLB' | 'PNG'
export function previewKind(input:ModelFormat):PreviewKind { return input==='PDF'||input==='SVG'?'PNG':'GLB' }
export function jobOutputKey(id:string,input:ModelFormat,output:ModelFormat,purpose?:'preview'|'conversion'){
  return 'temporary/'+id+'/output.'+(purpose==='preview'?previewKind(input):output).toLowerCase()
}
