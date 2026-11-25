// Bounded geometry-only browser fast path. No external dependencies or WebGL.
import type { ModelFormat } from './compatibility'
import { LOCAL_MAX_TRIANGLES, LOCAL_MAX_BYTES } from './browser-route'

type Mesh = { positions: number[]; indices: number[] }
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const MAX_VERTICES = LOCAL_MAX_TRIANGLES * 3
const MAX_OUTPUT = 50 * 1024 * 1024
const fail = (): never => { throw new Error('This model needs the server converter (unsupported content or local complexity limit).') }
const number = (v: string) => {
  if (!v || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v)) return fail()
  const n = Number(v)
  if (!Number.isFinite(n) || Math.abs(n) > 1e30) return fail()
  return Math.fround(n)
}
function vertex(mesh: Mesh, x: number, y: number, z: number, zUp: boolean) {
  if (mesh.positions.length / 3 >= MAX_VERTICES || ![x,y,z].every(n => Number.isFinite(n) && Math.abs(n) <= 1e30)) fail()
  mesh.positions.push(x, zUp ? z : y, zUp ? -y : z)
}
function triangle(mesh: Mesh, a: number, b: number, c: number) {
  if (mesh.indices.length / 3 >= LOCAL_MAX_TRIANGLES || ![a,b,c].every(i => Number.isInteger(i) && i >= 0 && i < mesh.positions.length / 3)) fail()
  mesh.indices.push(a,b,c)
}
function lines(bytes: ArrayBuffer) {
  const text = decoder.decode(bytes)
  if (text.includes('\0')) fail()
  return text.split(/\r?\n/)
}
function stl(bytes: ArrayBuffer): Mesh {
  const m: Mesh = { positions: [], indices: [] }
  const d = new DataView(bytes)
  if (bytes.byteLength >= 84 && 84 + 50 * d.getUint32(80,true) === bytes.byteLength) {
    const n = d.getUint32(80,true)
    if (!n || n > LOCAL_MAX_TRIANGLES) fail()
    for (let i=0;i<n;i++) {
      const start=84+i*50
      // Non-standard STL attribute/color extensions are handled by the backend.
      if (d.getUint16(start+48,true)!==0) fail()
      for (let j=0;j<3;j++) {
        const p=start+12+j*12
        vertex(m,d.getFloat32(p,true),d.getFloat32(p+4,true),d.getFloat32(p+8,true),true)
      }
      triangle(m,i*3,i*3+1,i*3+2)
    }
    return m
  }
  let state='solid', count=0
  for (const line of lines(bytes)) {
    if(line.length>4096) fail()
    const words=line.trim().split(/\s+/)
    if(!words[0]) continue
    if(state==='solid' && words[0]==='solid') state='facet'
    else if(state==='facet' && words[0]==='facet' && words[1]==='normal' && words.length===5) { words.slice(2).forEach(number); state='loop' }
    else if(state==='loop' && words.join(' ')==='outer loop') {count=0;state='vertex'}
    else if(state==='vertex' && words[0]==='vertex' && words.length===4) {vertex(m,number(words[1]),number(words[2]),number(words[3]),true);if(++count===3)state='endloop'}
    else if(state==='endloop' && words.join(' ')==='endloop') state='endfacet'
    else if(state==='endfacet' && words.join(' ')==='endfacet') {const n=m.positions.length/3;triangle(m,n-3,n-2,n-1);state='facet'}
    else if(state==='facet' && words[0]==='endsolid') state='done'
    else fail()
  }
  if(state!=='done'||!m.indices.length) fail()
  return m
}
function obj(bytes: ArrayBuffer): Mesh {
  const m: Mesh = {positions:[],indices:[]}
  for(const line of lines(bytes)) {
    if(line.length>4096) fail()
    const words=line.split('#',1)[0].trim().split(/\s+/)
    if(!words[0]||['o','g','s'].includes(words[0])) continue
    if(words[0]==='v'&&words.length===4) vertex(m,number(words[1]),number(words[2]),number(words[3]),false)
    else if(words[0]==='f'&&words.length===4) {
      // No UV, normal, material or polygon loss disguised as a local conversion.
      const ids=words.slice(1).map(w=>{if(!/^-?\d+$/.test(w))return fail();const i=Number(w);return i<0?m.positions.length/3+i:i-1})
      triangle(m,ids[0],ids[1],ids[2])
    } else fail()
  }
  if(!m.indices.length)fail()
  return m
}
function ply(bytes: ArrayBuffer): Mesh {
  const raw=new Uint8Array(bytes)
  const headerText=new TextDecoder().decode(raw.subarray(0,Math.min(raw.length,8192)))
  const match=/end_header\r?\n/.exec(headerText)
  if(!match) return fail()
  const end=match.index+match[0].length
  // Header must be plain ASCII; offsets then correspond to raw bytes.
  if([...headerText.slice(0,end)].some(c=>c.charCodeAt(0)>127))fail()
  const h=headerText.slice(0,end).split(/\r?\n/).map(s=>s.trim()).filter(s=>s&&!s.startsWith('comment ')&&!s.startsWith('obj_info '))
  if(h.length!==9||h[0]!=='ply'||!['format ascii 1.0','format binary_little_endian 1.0'].includes(h[1])||
     !/^element vertex \d+$/.test(h[2])||h[3]!=='property float x'||h[4]!=='property float y'||h[5]!=='property float z'||
     !/^element face \d+$/.test(h[6])||!/^property list uchar (int|uint) vertex_indices$/.test(h[7])||h[8]!=='end_header')fail()
  const nv=Number(h[2].split(' ')[2]),nt=Number(h[6].split(' ')[2])
  if(nv<3||nv>MAX_VERTICES||nt<1||nt>LOCAL_MAX_TRIANGLES)fail()
  const m:Mesh={positions:[],indices:[]}
  if(h[1]==='format binary_little_endian 1.0') {
    if(end+nv*12+nt*13!==raw.length)fail()
    const d=new DataView(bytes)
    let pos=end
    for(let i=0;i<nv;i++,pos+=12)vertex(m,d.getFloat32(pos,true),d.getFloat32(pos+4,true),d.getFloat32(pos+8,true),true)
    for(let i=0;i<nt;i++,pos+=13){if(d.getUint8(pos)!==3)fail();triangle(m,d.getUint32(pos+1,true),d.getUint32(pos+5,true),d.getUint32(pos+9,true))}
  } else {
    const rows=decoder.decode(raw.subarray(end)).trim().split(/\r?\n/)
    if(rows.length!==nv+nt)fail()
    for(let i=0;i<nv;i++){const w=rows[i].trim().split(/\s+/);if(w.length!==3)fail();vertex(m,number(w[0]),number(w[1]),number(w[2]),true)}
    for(let i=nv;i<rows.length;i++){const w=rows[i].trim().split(/\s+/);if(w.length!==4||w[0]!=='3'||!w.slice(1).every(x=>/^\d+$/.test(x)))fail();triangle(m,Number(w[1]),Number(w[2]),Number(w[3]))}
  }
  return m
}
function coords(m:Mesh,i:number,zUp:boolean):[number,number,number] {
  const [x,y,z]=m.positions.slice(i*3,i*3+3)
  return zUp?[x,-z,y]:[x,y,z]
}
function binaryStl(m:Mesh) {
  const bytes=new ArrayBuffer(84+50*m.indices.length/3),d=new DataView(bytes)
  new Uint8Array(bytes).set(encoder.encode('Formshift binary STL'))
  d.setUint32(80,m.indices.length/3,true)
  for(let i=0;i<m.indices.length;i+=3){
    const a=coords(m,m.indices[i],true),b=coords(m,m.indices[i+1],true),c=coords(m,m.indices[i+2],true)
    const u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j])
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    const length=Math.hypot(...n)
    const pos=84+i/3*50
    ;[...n.map(x=>length?x/length:0),...a,...b,...c].forEach((x,j)=>d.setFloat32(pos+j*4,x,true))
  }
  return new Blob([bytes],{type:'application/octet-stream'})
}
function binaryPly(m:Mesh) {
  const head=encoder.encode('ply\nformat binary_little_endian 1.0\nelement vertex '+m.positions.length/3+'\nproperty float x\nproperty float y\nproperty float z\nelement face '+m.indices.length/3+'\nproperty list uchar int vertex_indices\nend_header\n')
  const bytes=new ArrayBuffer(m.positions.length*4+m.indices.length/3*13),d=new DataView(bytes)
  let p=0
  for(let i=0;i<m.positions.length/3;i++)for(const v of coords(m,i,true)){d.setFloat32(p,v,true);p+=4}
  for(let i=0;i<m.indices.length;i+=3){d.setUint8(p++,3);for(let j=0;j<3;j++){d.setUint32(p,m.indices[i+j],true);p+=4}}
  return new Blob([head,bytes],{type:'application/octet-stream'})
}
function asciiObj(m:Mesh) {
  const rows=['# Formshift geometry-only OBJ\n']
  for(let i=0;i<m.positions.length;i+=3)rows.push('v '+m.positions.slice(i,i+3).join(' ')+'\n')
  for(let i=0;i<m.indices.length;i+=3)rows.push('f '+m.indices.slice(i,i+3).map(x=>x+1).join(' ')+'\n')
  return new Blob(rows,{type:'application/octet-stream'})
}
type GltfDocument = Record<string,unknown> & {asset?:{version?:string};buffers?:Array<{byteLength:number;uri?:string}>;images?:Array<{uri?:string;bufferView?:number}>;meshes?:unknown[]}
function base64(bytes:Uint8Array) {
  let out=''
  // divisible by three; no padding in the middle.
  for(let i=0;i<bytes.length;i+=24576)out+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)))
  return out
}
function checkDocument(doc:GltfDocument) {
  if(!doc||doc.asset?.version!=='2.0'||!Array.isArray(doc.buffers)||doc.buffers.length!==1||
     !Array.isArray(doc.meshes)||!doc.meshes.length||!Number.isSafeInteger(doc.buffers[0].byteLength)||doc.buffers[0].byteLength<1||
     (doc.images??[]).some(image=>image.uri!==undefined||!Number.isInteger(image.bufferView)))fail()
  // No external URIs in extensions or other nested objects. Only the single main buffer may have a data URI.
  const stack:unknown[]=[doc]
  while(stack.length){const v=stack.pop();if(v&&typeof v==='object')for(const [key,value] of Object.entries(v)){
    if(key==='uri'&&v!==doc.buffers[0])fail()
    if(value&&typeof value==='object')stack.push(value)
  }}
}
function makeGltf(doc:GltfDocument,bin:Uint8Array,target:'GLB'|'GLTF') {
  checkDocument(doc)
  const buffer=doc.buffers![0]
  if(buffer.byteLength!==bin.byteLength)fail()
  if(target==='GLTF'){
    buffer.uri='data:application/octet-stream;base64,'+base64(bin)
    return new Blob([JSON.stringify(doc)],{type:'model/gltf+json'})
  }
  delete buffer.uri
  const text=encoder.encode(JSON.stringify(doc)),jsonLength=Math.ceil(text.length/4)*4,binLength=Math.ceil(bin.length/4)*4
  const bytes=new ArrayBuffer(28+jsonLength+binLength),u=new Uint8Array(bytes),d=new DataView(bytes)
  u.set(encoder.encode('glTF'));d.setUint32(4,2,true);d.setUint32(8,bytes.byteLength,true);d.setUint32(12,jsonLength,true);u.set(encoder.encode('JSON'),16)
  u.fill(32,20,20+jsonLength);u.set(text,20)
  d.setUint32(20+jsonLength,binLength,true);u.set([66,73,78,0],24+jsonLength);u.set(bin,28+jsonLength)
  return new Blob([bytes],{type:'model/gltf-binary'})
}
function meshGltf(m:Mesh,target:'GLB'|'GLTF') {
  const positions=m.positions,indices=m.indices,bin=new Uint8Array((positions.length+indices.length)*4),d=new DataView(bin.buffer)
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity]
  positions.forEach((v,i)=>{d.setFloat32(i*4,v,true);lo[i%3]=Math.min(lo[i%3],v);hi[i%3]=Math.max(hi[i%3],v)})
  indices.forEach((v,i)=>d.setUint32((positions.length+i)*4,v,true))
  return makeGltf({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.length*4,target:34962},{buffer:0,byteOffset:positions.length*4,byteLength:indices.length*4,target:34963}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3',min:lo,max:hi},{bufferView:1,componentType:5125,count:indices.length,type:'SCALAR'}]},bin,target)
}
function repack(bytes:ArrayBuffer,input:'GLB'|'GLTF',target:'GLB'|'GLTF'){
  let doc:GltfDocument,bin:Uint8Array
  if(input==='GLB'){
    const d=new DataView(bytes),u=new Uint8Array(bytes)
    if(bytes.byteLength<28||d.getUint32(0,true)!==0x46546c67||d.getUint32(4,true)!==2||d.getUint32(8,true)!==bytes.byteLength||d.getUint32(16,true)!==0x4e4f534a)fail()
    const n=d.getUint32(12,true),p=20+n
    if(n%4||p+8>bytes.byteLength||d.getUint32(p+4,true)!==0x004e4942)fail()
    const length=d.getUint32(p,true)
    if(length%4||p+8+length!==bytes.byteLength)fail()
    doc=JSON.parse(decoder.decode(u.subarray(20,p)))
    checkDocument(doc)
    if(doc.buffers![0].uri!==undefined||doc.buffers![0].byteLength>length||length-doc.buffers![0].byteLength>3)fail()
    bin=u.subarray(p+8,p+8+doc.buffers![0].byteLength)
  }else{
    doc=JSON.parse(decoder.decode(bytes));checkDocument(doc)
    const uri=doc.buffers![0].uri
    const match=typeof uri==='string'&&/^data:application\/(?:octet-stream|gltf-buffer);base64,([A-Za-z0-9+/]+={0,2})$/.exec(uri)
    if(!match)return fail()
    bin=Uint8Array.from(atob(match[1]),c=>c.charCodeAt(0))
    if(bin.length!==doc.buffers![0].byteLength)fail()
  }
  // Exact same-format repacking is unnecessary; preserve original file bytes.
  if(input===target)return new Blob([bytes],{type:'application/octet-stream'})
  return makeGltf(doc,bin,target)
}
export function convertBytes(bytes:ArrayBuffer,input:ModelFormat,output:ModelFormat):Blob {
  if(!bytes.byteLength||bytes.byteLength>LOCAL_MAX_BYTES)fail()
  let result:Blob
  if((input==='GLB'||input==='GLTF')&&(output==='GLB'||output==='GLTF'))result=repack(bytes,input,output)
  else {
    const m=input==='STL'?stl(bytes):input==='OBJ'?obj(bytes):input==='PLY'?ply(bytes):fail()
    if(output==='STL')result=binaryStl(m)
    else if(output==='OBJ')result=asciiObj(m)
    else if(output==='PLY')result=binaryPly(m)
    else if(output==='GLB'||output==='GLTF')result=meshGltf(m,output)
    else return fail()
  }
  if(!result.size||result.size>MAX_OUTPUT)fail()
  return result
}
