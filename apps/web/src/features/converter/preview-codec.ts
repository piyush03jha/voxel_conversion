import { convertBytes } from './mesh-codec'
import { LOCAL_MAX_BYTES, LOCAL_MAX_TRIANGLES } from './browser-route'
import type { ModelFormat } from './compatibility'

// Build a geometry-only GLB for display. Never pass user-controlled URLs,
// images, extensions, animation, skins, or arbitrary metadata to GLTFLoader.
const reject = (): never => { throw new Error('Preview geometry is unsupported or exceeds local limits.') }
type Dict = Record<string, unknown>
const dict = (v:unknown):Dict => v && typeof v==='object' && !Array.isArray(v) ? v as Dict : reject()
const arr = (v:unknown):unknown[] => Array.isArray(v) ? v : reject()
const integer = (v:unknown,min:number,max:number):number => typeof v==='number' && Number.isSafeInteger(v) && v>=min && v<=max ? v : reject()
const finiteArray = (v:unknown,n:number) => {
  const values=arr(v)
  if(values.length!==n || values.some(x=>typeof x!=='number'||!Number.isFinite(x)||Math.abs(x)>1e12))reject()
  return values as number[]
}
export async function preparePreview(bytes:ArrayBuffer,format:ModelFormat):Promise<Blob>{
  const source=await convertBytes(bytes,format,'GLB').arrayBuffer()
  if(source.byteLength>LOCAL_MAX_BYTES*2)reject()
  const d=new DataView(source),raw=new Uint8Array(source)
  const jsonLength=d.getUint32(12,true), start=28+jsonLength
  const doc=dict(JSON.parse(new TextDecoder().decode(raw.subarray(20,20+jsonLength))))
  const bin=raw.subarray(start)
  const oldViews=arr(doc.bufferViews),oldAccessors=arr(doc.accessors),oldMeshes=arr(doc.meshes)
  if(oldViews.length>2048||oldAccessors.length>2048||oldMeshes.length>128)reject()
  const views:Dict[]=[],accessors:Dict[]=[],meshes:Dict[]=[],triangles:number[]=[]
  const copied=new Map<string,number>()
  function accessor(value:unknown,position:boolean,vertexCount=0){
    const id=integer(value,0,oldAccessors.length-1), key=id+':'+position+':'+vertexCount
    const known=copied.get(key)
    if(known!==undefined)return known
    const a=dict(oldAccessors[id])
    if(a.sparse!==undefined||a.normalized===true)reject()
    const count=integer(a.count,1,LOCAL_MAX_TRIANGLES*3)
    const view=dict(oldViews[integer(a.bufferView,0,oldViews.length-1)])
    if(view.buffer!==0||view.extensions!==undefined)reject()
    const component=position?integer(a.componentType,5126,5126):integer(a.componentType,5121,5125)
    const width=position?12:component===5121?1:component===5123?2:component===5125?4:reject()
    if(a.type!==(position?'VEC3':'SCALAR'))reject()
    const offset=integer(view.byteOffset??0,0,bin.byteLength)
    const length=integer(view.byteLength,1,bin.byteLength-offset)
    const at=integer(a.byteOffset??0,0,length)
    const stride=integer(view.byteStride??width,width,252)
    if(!position&&stride!==width || stride%(position?4:width)!==0 || (offset+at)%(position?4:width)!==0 || at+(count-1)*stride+width>length)reject()
    const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength)
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity]
    for(let i=0;i<count;i++){
      const p=offset+at+i*stride
      if(position)for(let j=0;j<3;j++){
        const n=data.getFloat32(p+j*4,true)
        if(!Number.isFinite(n)||Math.abs(n)>1e12)reject()
        min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n)
      }
      else {
        const n=width===1?data.getUint8(p):width===2?data.getUint16(p,true):data.getUint32(p,true)
        if(n>=vertexCount)reject()
      }
    }
    const viewId=views.length
    views.push({buffer:0,byteOffset:offset,byteLength:length,...(stride!==width?{byteStride:stride}:{})})
    const next=accessors.length
    accessors.push({bufferView:viewId,byteOffset:at,componentType:component,count,type:position?'VEC3':'SCALAR',...(position?{min,max}:{})})
    copied.set(key,next)
    return next
  }
  let total=0, totalVertices=0
  for(const value of oldMeshes){
    const primitives:Dict[]=[]
    let meshTriangles=0
    for(const p of arr(dict(value).primitives)){
      if(primitives.length>=128)reject()
      const primitive=dict(p)
      if((primitive.mode??4)!==4||primitive.extensions!==undefined)reject()
      const pos=accessor(dict(primitive.attributes).POSITION,true)
      const vertices=accessors[pos].count as number
      const index=primitive.indices===undefined?undefined:accessor(primitive.indices,false,vertices)
      const count=index===undefined?vertices:accessors[index].count as number
      if(count%3)reject()
      meshTriangles+=count/3;total+=count/3;totalVertices+=vertices
      if(total>LOCAL_MAX_TRIANGLES||totalVertices>LOCAL_MAX_TRIANGLES*3)reject()
      primitives.push({attributes:{POSITION:pos},...(index===undefined?{}:{indices:index}),mode:4})
    }
    if(!primitives.length)reject()
    meshes.push({primitives});triangles.push(meshTriangles)
  }
  const sourceNodes=arr(doc.nodes), scenes=arr(doc.scenes)
  if(sourceNodes.length>512||scenes.length>32||!scenes.length)reject()
  const nodes=sourceNodes.map(value=>{
    const node=dict(value),out:Dict={}
    if(node.mesh!==undefined)out.mesh=integer(node.mesh,0,meshes.length-1)
    if(node.children!==undefined){const children=arr(node.children);if(children.length>512)reject();out.children=children.map(v=>integer(v,0,sourceNodes.length-1))}
    if(node.matrix!==undefined)out.matrix=finiteArray(node.matrix,16)
    else for(const [key,length] of [['translation',3],['rotation',4],['scale',3]] as const)if(node[key]!==undefined)out[key]=finiteArray(node[key],length)
    return out
  })
  const rootValues=arr(dict(scenes[integer(doc.scene??0,0,scenes.length-1)]).nodes)
  if(rootValues.length>512)reject()
  const roots=rootValues.map(v=>integer(v,0,nodes.length-1))
  const visited=new Set<number>()
  let displayed=0
  function visit(id:number,depth:number){
    if(depth>64||visited.has(id))reject()
    visited.add(id)
    const node=nodes[id]
    if(node.mesh!==undefined)displayed+=triangles[node.mesh as number]
    if(displayed>LOCAL_MAX_TRIANGLES)reject()
    for(const child of (node.children??[]) as number[])visit(child,depth+1)
  }
  for(const root of roots)visit(root,0)
  if(!displayed)reject()
  // Discard unused nodes as well, so a malicious unused cyclic graph is never loaded.
  const remap=new Map([...visited].map((id,i)=>[id,i]))
  const safeNodes=[...visited].map(id=>({...nodes[id],...(nodes[id].children?{children:(nodes[id].children as number[]).map(child=>remap.get(child))}:{})}))
  const json=new TextEncoder().encode(JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:roots.map(id=>remap.get(id))}],nodes:safeNodes,meshes,accessors,bufferViews:views,buffers:[{byteLength:bin.length}]}))
  const padded=Math.ceil(json.length/4)*4
  const header=new Uint8Array(28+padded),h=new DataView(header.buffer)
  h.setUint32(0,0x46546c67,true);h.setUint32(4,2,true);h.setUint32(8,header.length+bin.length,true);h.setUint32(12,padded,true);h.setUint32(16,0x4e4f534a,true)
  header.fill(32,20,20+padded);header.set(json,20)
  h.setUint32(20+padded,bin.length,true);h.setUint32(24+padded,0x004e4942,true)
  return new Blob([header,bin],{type:'model/gltf-binary'})
}
