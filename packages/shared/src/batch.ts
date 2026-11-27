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

export const PACKAGE_INPUTS=['OBJ','GLTF','GLB','FBX','USD','USDA','USDC'] as const
export const PACKAGE_EXPORTS=['OBJ','USD','USDA','USDC'] as const
export function supportsPackage(format:string){return PACKAGE_INPUTS.some(f=>f===format)}
export function supportsPackageExport(format:string){return PACKAGE_EXPORTS.some(f=>f===format)}
export function packageOutputEntry(output:string,compression:string,bundleEntry?:string){return compression!=='None'&&bundleEntry?bundleEntry:'model.'+output.toLowerCase()}
export function validPackageOptions(input:string,output:string,compression:string,purpose:string|undefined,entry:string|undefined,packaged:boolean){
  if(entry!==undefined&&!supportsPackage(input))return false
  if(purpose==='preview')return !packaged&&compression==='None'&&output==='GLB'
  if(entry&&compression!=='None')return packaged&&input===output
  return !packaged||compression==='None'&&supportsPackageExport(output)
}
