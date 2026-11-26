import { getFormatFromFilename } from '../converter/compatibility'
import type { ModelFormat } from '../converter/compatibility'
import { BATCH_MAX_MODELS,safeBatchPath } from '../../../../../packages/shared/src/batch'
import type { Asset } from './zip'
export type Model={asset:Asset;format:ModelFormat;dependencies:Asset[];error?:string}
const images=/\.(png|jpe?g|webp|tga|bmp|tiff?|exr|hdr|ktx2|dds)$/i
function resolve(parent:string,reference:string,uri=false){
  const ref=uri?decodeURIComponent(reference):reference
  if(!ref||ref.startsWith('/')||/[\\:\u0000-\u001f\u007f?#]/.test(ref))throw new Error('Unsafe external reference')
  const parts=parent.split('/').slice(0,-1)
  for(const p of ref.split('/')){if(p==='..'){if(!parts.length)throw new Error('Dependency escapes selected folder');parts.pop()}else if(p!=='.'&&p)parts.push(p)}
  const name=parts.join('/');if(!safeBatchPath(name))throw new Error('Invalid dependency path');return name
}
async function lines(file:File,signal:AbortSignal,visit:(line:string)=>void){
  const reader=file.stream().pipeThrough(new TextDecoderStream('utf-8',{fatal:true})).getReader()
  let tail=''
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;const rows=(tail+value).split(/\r?\n/);tail=rows.pop()??'';for(const row of rows){if(row.length>65536||row.trimEnd().endsWith('\\'))throw new Error('Unsupported continued or oversized OBJ/MTL line');visit(row.split('#',1)[0].trim())}if(tail.length>65536)throw new Error('Oversized OBJ/MTL line')}if(tail)visit(tail.split('#',1)[0].trim())}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}
export async function discover(assets:Asset[],signal:AbortSignal){
  const index=new Map(assets.map(a=>[a.path,a])),models:Model[]=[]
  for(const asset of assets){
    signal.throwIfAborted()
    const format=getFormatFromFilename(asset.path)
    if(!format)continue
    if(models.length>=BATCH_MAX_MODELS)throw new Error('A batch can contain up to 100 models')
    const deps=new Map<string,Asset>()
    const find=(parent:string,reference:string,uri=false)=>{
      const path=resolve(parent,reference,uri),found=index.get(path)
      if(!found)throw new Error('Missing dependency: '+reference)
      deps.set(path,found);return found
    }
    let error:string|undefined
    try{
      if(format==='OBJ'){
        const materials:Asset[]=[]
        await lines(asset.file,signal,line=>{const m=/^mtllib\s+(.+)$/i.exec(line);if(!m)return;const raw=m[1].trim();if(index.has(resolve(asset.path,raw)))materials.push(find(asset.path,raw));else for(const ref of raw.split(/\s+/))materials.push(find(asset.path,ref))})
        for(const mtl of materials){
          if(!/\.mtl$/i.test(mtl.path))throw new Error('Invalid MTL dependency')
          await lines(mtl.file,signal,line=>{const match=/^(?:map_\S+|bump|disp|decal|refl|norm)\s+(.+)$/i.exec(line);if(!match)return;if(match[1].startsWith('-'))throw new Error('MTL map options not supported for bundled models');const texture=find(mtl.path,match[1].trim());if(!images.test(texture.path))throw new Error('Unsupported texture type')})
        }
      }else if(format==='GLTF'&&asset.file.size<=8*1024**2){
        const doc:unknown=JSON.parse(await asset.file.text()),stack=[doc]
        while(stack.length){const item=stack.pop();if(item&&typeof item==='object')for(const [key,value] of Object.entries(item)){if(key==='uri'){if(typeof value!=='string')throw new Error('Invalid glTF URI');if(!value.startsWith('data:')){const file=find(asset.path,value,true);if(!images.test(file.path)&&!/\.bin$/i.test(file.path))throw new Error('Unsupported glTF dependency')}}else if(value&&typeof value==='object')stack.push(value)}}
      }
    }catch(e){error=e instanceof Error?e.message:'Dependency scan failed'}
    models.push({asset,format,dependencies:[...deps.values()],...(error?{error}:{})})
  }
  return models
}
