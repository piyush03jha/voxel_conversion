import { getFormatFromFilename } from '../converter/compatibility'
import type { ModelFormat } from '../converter/compatibility'
import { BATCH_MAX_MODELS,safeBatchPath,supportsPackage } from '../../../../../packages/shared/src/batch'
import type { Asset } from './zip'
export type Model={asset:Asset;format:ModelFormat;dependencies:Asset[];error?:string;warning?:string;manual?:boolean}
export const images=/\.(png|jpe?g|webp|tga|bmp|tiff?|exr|hdr|ktx2|dds)$/i
function resolve(parent:string,reference:string,uri=false){
  const ref=uri?decodeURIComponent(reference):reference
  if(!ref||ref.startsWith('/')||/[\\:\u0000-\u001f\u007f?#]/.test(ref))throw new Error('Unsafe external reference')
  const parts=parent.split('/').slice(0,-1)
  for(const p of ref.split('/')){if(p==='..'){if(!parts.length)throw new Error('Dependency escapes selected folder');parts.pop()}else if(p!=='.'&&p)parts.push(p)}
  const name=parts.join('/');if(!safeBatchPath(name))throw new Error('Invalid dependency path');return name
}
// MTL standard map options: consume numeric vectors or fixed-arity values,
// preserve spaces in the remaining filename; reject unknown/ambiguous options.
export function textureReference(raw:string){
  let text=raw.trim()
  while(text.startsWith('-')){
    const match=/^(\S+)\s+(.+)$/.exec(text)
    if(!match)throw new Error('Invalid MTL map option')
    const option=match[1].toLowerCase();text=match[2]
    if(['-o','-s','-t'].includes(option)){
      let count=0
      while(count<3){const n=/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s+(.+)$/i.exec(text);if(!n)break;text=n[2];count++}
      if(!count)throw new Error('Invalid MTL vector option')
    }else{
      const arity=option==='-mm'?2:['-blendu','-blendv','-boost','-texres','-clamp','-bm','-imfchan','-type','-cc','-colorspace'].includes(option)?1:0
      if(!arity)throw new Error('Unsupported MTL map option: '+option)
      for(let i=0;i<arity;i++){const arg=/^\S+\s+(.+)$/.exec(text);if(!arg)throw new Error('Missing MTL map option argument');text=arg[1]}
    }
  }
  return text.trim()
}
const usdLayer=/\.(usd|usda|usdc)$/i
function parent(path:string){return path.split('/').slice(0,-1).join('/')}
function inFolder(path:string,folder:string){return !folder||path.startsWith(folder+'/')}
export function attachFolder(root:Model,assets:Asset[]):Model{
  if(!supportsPackage(root.format))throw new Error('This format does not use external model packages')
  // Keep sibling directories (models/, textures/) inside the selected top-level folder.
  const folder=root.asset.path.includes('/')?root.asset.path.split('/')[0]:parent(root.asset.path)
  const known=new Map(root.dependencies.map(a=>[a.path,a]))
  for(const a of assets)if(a.path!==root.asset.path&&inFolder(a.path,folder)&&(images.test(a.path)||/\.(mtl|bin)$/i.test(a.path)||(['USD','USDA','USDC'].includes(root.format)&&usdLayer.test(a.path))))known.set(a.path,a)
  return {...root,dependencies:[...known.values()],manual:true,warning:'Folder assets included by selection; opaque importer references may still require relinking.'}
}
async function gltfDocument(asset:Asset,format:ModelFormat){
  if(format==='GLTF'){
    if(asset.file.size>8*1024**2)return null
    return JSON.parse(await asset.file.text()) as unknown
  }
  const h=new DataView(await asset.file.slice(0,20).arrayBuffer())
  if(h.byteLength!==20||h.getUint32(0,true)!==0x46546c67||h.getUint32(4,true)!==2||h.getUint32(8,true)!==asset.file.size||h.getUint32(16,true)!==0x4e4f534a)throw new Error('Invalid GLB header')
  const length=h.getUint32(12,true)
  if(length>8*1024**2||length+20>asset.file.size)throw new Error('GLB manifest exceeds scan limit')
  return JSON.parse(await asset.file.slice(20,20+length).text()) as unknown
}
async function lines(file:File,signal:AbortSignal,visit:(line:string)=>void){
  const reader=file.stream().pipeThrough(new TextDecoderStream('utf-8',{fatal:true})).getReader()
  let tail=''
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;const rows=(tail+value).split(/\r?\n/);tail=rows.pop()??'';for(const row of rows){if(row.length>65536||row.trimEnd().endsWith('\\'))throw new Error('Unsupported continued or oversized OBJ/MTL line');visit(row.split('#',1)[0].trim())}if(tail.length>65536)throw new Error('Oversized OBJ/MTL line')}if(tail)visit(tail.split('#',1)[0].trim())}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}
export async function discover(assets:Asset[],signal:AbortSignal){
  const index=new Map(assets.map(a=>[a.path,a])),models:Model[]=[]
  const referencedLayers=new Set<string>()
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
    let error:string|undefined,warning:string|undefined
    let manual=false
    try{
      if(format==='OBJ'){
        const materials:Asset[]=[]
        await lines(asset.file,signal,line=>{const m=/^mtllib\s+(.+)$/i.exec(line);if(!m)return;const raw=m[1].trim();if(index.has(resolve(asset.path,raw)))materials.push(find(asset.path,raw));else for(const ref of raw.split(/\s+/))materials.push(find(asset.path,ref))})
        for(const mtl of materials){
          if(!/\.mtl$/i.test(mtl.path))throw new Error('Invalid MTL dependency')
          await lines(mtl.file,signal,line=>{const match=/^(?:map_\S+|bump|disp|decal|refl|norm)\s+(.+)$/i.exec(line);if(!match)return;const texture=find(mtl.path,textureReference(match[1]));if(!images.test(texture.path))throw new Error('Unsupported texture type')})
        }
      }else if(format==='GLTF'||format==='GLB'){
        const doc=await gltfDocument(asset,format),stack=[doc]
        if(doc===null){warning='Large glTF manifest: external dependencies require manual folder selection.';manual=true}
        while(stack.length){const item=stack.pop();if(item&&typeof item==='object')for(const [key,value] of Object.entries(item)){if(key==='uri'){if(typeof value!=='string')throw new Error('Invalid glTF URI');if(!value.startsWith('data:')){const file=find(asset.path,value,true);if(!images.test(file.path)&&!/\.bin$/i.test(file.path))throw new Error('Unsupported glTF dependency')}}else if(value&&typeof value==='object')stack.push(value)}}
      }else if(['USD','USDA','USDC'].includes(format)){
        const seen=new Set<string>(),visiting=new Set<string>()
        async function scanLayer(layer:Asset){
          if(visiting.has(layer.path))throw new Error('Circular USD layer dependency')
          if(seen.has(layer.path))return
          if(seen.size>256)throw new Error('USD layer dependency limit')
          seen.add(layer.path);visiting.add(layer.path)
          if(!(await layer.file.slice(0,8).text()).startsWith('#usda')||layer.file.size>8*1024**2){warning='Binary or large USD layer: select the main model and attach its folder assets.';manual=true;visiting.delete(layer.path);return}
          const text=await layer.file.text()
          for(const match of text.matchAll(/@([^@\r\n]+)@/g)){
            const dep=find(layer.path,match[1]);if(usdLayer.test(dep.path)){referencedLayers.add(dep.path);await scanLayer(dep)}else if(!images.test(dep.path))throw new Error('Unsupported USD asset type: '+dep.path)
          }
          visiting.delete(layer.path)
        }
        await scanLayer(asset)
      }else if(format==='FBX'){
        warning='FBX external references are importer-dependent. Select the primary model and attach its folder textures.';manual=true
      }
    }catch(e){signal.throwIfAborted();error=e instanceof Error?e.message:'Dependency scan failed'}
    models.push({asset,format,dependencies:[...deps.values()],...(error?{error}:{}),...(warning?{warning}:{}),...(manual?{manual:true}:{})})
  }
  const roots=models.filter(m=>!referencedLayers.has(m.asset.path))
  if(!roots.length&&models.length)return models
  return roots.map(m=>{
    if(!m.manual)return m
    const top=m.asset.path.includes('/')?m.asset.path.split('/')[0]:''
    const siblings=roots.filter(r=>inFolder(r.asset.path,top))
    return siblings.length===1?attachFolder(m,assets):m
  })
}
