export const BATCH_MAX_MODELS=100
export const BATCH_MAX_ENTRIES=5000
export const BATCH_MAX_EXPANDED_BYTES=1024**3
export const BATCH_MAX_DEPTH=2
export function safeBatchPath(value:unknown):value is string{
  return typeof value==='string'&&value.length>0&&value.length<=512&&!/[\\:\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(p=>p!==''&&p!=='.'&&p!=='..'&&p.length<=255&&!p.endsWith('.')&&!p.endsWith(' '))
}
export function bundleInputKey(id:string,format:string,bundleEntry?:string){
  return 'temporary/'+id+'/input.'+(bundleEntry?'zip':format.toLowerCase())
}
