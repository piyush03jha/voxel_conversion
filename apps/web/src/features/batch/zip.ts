import { BATCH_MAX_DEPTH,BATCH_MAX_ENTRIES,BATCH_MAX_EXPANDED_BYTES,safeBatchPath } from '../../../../../packages/shared/src/batch'
export type Asset={path:string;file:File}
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true})
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0})
function update(c:number,bytes:Uint8Array){for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return c>>>0}
function view(b:Uint8Array){return new DataView(b.buffer,b.byteOffset,b.byteLength)}
function num(n:bigint){const v=Number(n);if(!Number.isSafeInteger(v)||v<0)throw new Error('ZIP size outside supported range');return v}
async function read(blob:Blob,start:number,length:number){
  if(!Number.isSafeInteger(start)||start<0||length<0||start+length>blob.size)throw new Error('Invalid ZIP bounds')
  return new Uint8Array(await blob.slice(start,start+length).arrayBuffer())
}
function fail():never{throw new Error('Invalid or unsupported ZIP archive')}
type Entry={path:string;size:number;packed:number;offset:number;method:number;crc:number;name:Uint8Array;flags:number}
async function directory(blob:Blob):Promise<Entry[]>{
  const start=Math.max(0,blob.size-65557),tail=await read(blob,start,blob.size-start),d=view(tail)
  let i=tail.length-22
  for(;i>=0;i--)if(d.getUint32(i,true)===0x06054b50&&i+22+d.getUint16(i+20,true)===tail.length)break
  if(i<0||d.getUint16(i+4,true)||d.getUint16(i+6,true))fail()
  let count=d.getUint16(i+10,true),size=d.getUint32(i+12,true),offset=d.getUint32(i+16,true)
  if(count===65535||size===0xffffffff||offset===0xffffffff){
    const loc=view(await read(blob,start+i-20,20))
    if(loc.getUint32(0,true)!==0x07064b50||loc.getUint32(4,true)!==0||loc.getUint32(16,true)!==1)fail()
    const z=view(await read(blob,num(loc.getBigUint64(8,true)),56))
    if(z.getUint32(0,true)!==0x06064b50||z.getUint32(16,true)||z.getUint32(20,true))fail()
    count=num(z.getBigUint64(32,true));size=num(z.getBigUint64(40,true));offset=num(z.getBigUint64(48,true))
  }
  if(count>BATCH_MAX_ENTRIES||size>8*1024**2||offset+size>start+i)fail()
  const bytes=await read(blob,offset,size),v=view(bytes),entries:Entry[]=[],seen=new Set<string>()
  let p=0
  for(let n=0;n<count;n++){
    if(p+46>bytes.length||v.getUint32(p,true)!==0x02014b50)fail()
    const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true)
    let packed=v.getUint32(p+20,true),size=v.getUint32(p+24,true),local=v.getUint32(p+42,true)
    const nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),end=p+46+nl+el+cl
    if(end>bytes.length||v.getUint16(p+34,true)||flags&1||![0,8].includes(method)||((v.getUint32(p+38,true)>>>16)&0xf000)===0xa000)fail()
    const name=bytes.slice(p+46,p+46+nl),path=dec.decode(name)
    if(size===0xffffffff||packed===0xffffffff||local===0xffffffff){
      let x=p+46+nl,found=false
      while(x+4<=p+46+nl+el){const id=v.getUint16(x,true),len=v.getUint16(x+2,true);x+=4;if(x+len>p+46+nl+el)fail();if(id===1){let y=x;const next=()=>{if(y+8>x+len)fail();const k=num(v.getBigUint64(y,true));y+=8;return k};if(size===0xffffffff)size=next();if(packed===0xffffffff)packed=next();if(local===0xffffffff)local=next();found=true;break}x+=len}
      if(!found)fail()
    }
    p=end
    const dir=path.endsWith('/'),clean=dir?path.slice(0,-1):path
    if(!safeBatchPath(clean)||seen.has(clean.toLowerCase()))throw new Error('Unsafe or duplicate ZIP path')
    seen.add(clean.toLowerCase())
    if(dir)continue
    if(size>8*1024**2&&size>200*Math.max(1,packed))throw new Error('ZIP expansion ratio exceeded')
    if(local+30+packed>offset||method===0&&packed!==size)fail()
    entries.push({path:clean,size,packed,offset:local,method,crc,name,flags})
  }
  if(p!==bytes.length)fail()
  return entries
}
export class Scratch {
  private dir?:FileSystemDirectoryHandle
  private root?:FileSystemDirectoryHandle
  private name='formshift-batch-'+Date.now()+'-'+crypto.randomUUID()
  private count=0
  private memory=0
  async save(stream:ReadableStream<Uint8Array>,name:string,expected:number,signal:AbortSignal,crc?:number):Promise<File>{
    if(!Number.isSafeInteger(expected)||expected<0)throw new Error('Invalid file length')
    if(!this.dir&&navigator.storage?.getDirectory){
      this.root=await navigator.storage.getDirectory()
      // Recover disk space from abandoned tabs after the job retention window.
      const root=this.root as FileSystemDirectoryHandle & {values?:()=>AsyncIterable<FileSystemHandle>}
      if(root.values)for await(const item of root.values()){const match=/^formshift-batch-(\d+)-/.exec(item.name);if(item.kind==='directory'&&match&&Date.now()-Number(match[1])>48*3600000)await root.removeEntry(item.name,{recursive:true}).catch(()=>undefined)}
      this.dir=await this.root.getDirectoryHandle(this.name,{create:true})
    }
    const handle=this.dir?await this.dir.getFileHandle(String(++this.count),{create:true}):undefined
    if(!handle&&this.memory+expected>64*1024**2)throw new Error('Large ZIP processing requires browser private file storage (OPFS)')
    const writer=handle?await handle.createWritable():undefined
    const chunks:Uint8Array<ArrayBuffer>[]=[]
    let bytes=0,c=0xffffffff
    const reader=stream.getReader()
    const abort=()=>{void reader.cancel().catch(()=>undefined)}
    signal.addEventListener('abort',abort,{once:true})
    try{
      while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;if(!value)continue;bytes+=value.byteLength;if(bytes>expected)throw new Error('Unexpected expanded file length');if(crc!==undefined)c=update(c,value);const chunk=new Uint8Array(value);if(writer)await writer.write(chunk);else chunks.push(chunk)}
      signal.throwIfAborted()
      if(bytes!==expected||crc!==undefined&&((c^0xffffffff)>>>0)!==crc)throw new Error('ZIP checksum or length mismatch')
      if(writer&&handle){await writer.close();return new File([await handle.getFile()],name)}
      this.memory+=bytes;return new File(chunks,name)
    }catch(error){await writer?.abort().catch(()=>undefined);throw error}
    finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>undefined);reader.releaseLock()}
  }
  async close(){if(this.root)await this.root.removeEntry(this.name,{recursive:true}).catch(()=>undefined);this.dir=undefined;this.root=undefined;this.memory=0}
}
async function unpack(blob:Blob,entry:Entry,scratch:Scratch,signal:AbortSignal){
  const h=view(await read(blob,entry.offset,30))
  if(h.getUint32(0,true)!==0x04034b50||h.getUint16(6,true)!==entry.flags||h.getUint16(8,true)!==entry.method)fail()
  const nl=h.getUint16(26,true),el=h.getUint16(28,true),name=await read(blob,entry.offset+30,nl)
  if(name.length!==entry.name.length||name.some((b,i)=>b!==entry.name[i]))fail()
  const start=entry.offset+30+nl+el
  if(start+entry.packed>blob.size)fail()
  const slice=blob.slice(start,start+entry.packed)
  const stream=entry.method===0?slice.stream():slice.stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
  return scratch.save(stream,entry.path.split('/').at(-1)!,entry.size,signal,entry.crc)
}
export async function expandAssets(input:Asset[],scratch:Scratch,signal:AbortSignal,report:(s:string)=>void){
  const out:Asset[]=[],seen=new Set<string>();let expanded=0,entries=0
  async function walk(asset:Asset,depth:number){
    signal.throwIfAborted()
    if(!safeBatchPath(asset.path)||++entries>BATCH_MAX_ENTRIES)throw new Error('Unsafe path or batch entry limit exceeded')
    if(!asset.path.toLowerCase().endsWith('.zip')){
      const key=asset.path.toLowerCase()
      if(seen.has(key))throw new Error('Duplicate file path: '+asset.path)
      seen.add(key);out.push(asset);return
    }
    if(depth>=BATCH_MAX_DEPTH)throw new Error('Nested ZIP depth limit exceeded')
    report('Scanning '+asset.path)
    const files=await directory(asset.file)
    for(const entry of files){
      expanded+=entry.size
      if(expanded>BATCH_MAX_EXPANDED_BYTES)throw new Error('ZIP expanded data exceeds 1 GiB safety budget')
      const path=asset.path.slice(0,-4)+'/'+entry.path
      if(!safeBatchPath(path))throw new Error('Unsafe nested ZIP path')
      const file=await unpack(asset.file,entry,scratch,signal)
      await walk({path,file},depth+1)
    }
  }
  for(const asset of input)await walk(asset,0)
  return out
}
async function crcFile(blob:Blob,signal:AbortSignal){
  let c=0xffffffff;const reader=blob.stream().getReader()
  try{while(true){signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;c=update(c,value)}return (c^0xffffffff)>>>0}
  finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}
// ZIP64 stored entries: file-backed Blob pieces, no full-model ArrayBuffer copies.
export async function zipFiles(assets:{path:string;file:Blob}[],signal:AbortSignal,report?:(s:string)=>void){
  const parts:BlobPart[]=[],central:BlobPart[]=[],seen=new Set<string>();let offset=0,centralSize=0
  if(!assets.length||assets.length>BATCH_MAX_ENTRIES)throw new Error('Invalid ZIP entry count')
  for(const asset of assets){
    if(!safeBatchPath(asset.path)||seen.has(asset.path.toLowerCase()))throw new Error('Duplicate or unsafe ZIP output path')
    seen.add(asset.path.toLowerCase());report?.('Packing '+asset.path)
    const name=enc.encode(asset.path),size=BigInt(asset.file.size),crc=await crcFile(asset.file,signal)
    const local=new Uint8Array(30+name.length+20),l=view(local)
    l.setUint32(0,0x04034b50,true);l.setUint16(4,45,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,0xffffffff,true);l.setUint32(22,0xffffffff,true);l.setUint16(26,name.length,true);l.setUint16(28,20,true)
    local.set(name,30);let x=30+name.length;l.setUint16(x,1,true);l.setUint16(x+2,16,true);l.setBigUint64(x+4,size,true);l.setBigUint64(x+12,size,true)
    const header=new Uint8Array(46+name.length+28),h=view(header)
    h.setUint32(0,0x02014b50,true);h.setUint16(4,45,true);h.setUint16(6,45,true);h.setUint16(8,0x800,true);h.setUint16(14,33,true);h.setUint32(16,crc,true);h.setUint32(20,0xffffffff,true);h.setUint32(24,0xffffffff,true);h.setUint16(28,name.length,true);h.setUint16(30,28,true);h.setUint32(42,0xffffffff,true)
    header.set(name,46);x=46+name.length;h.setUint16(x,1,true);h.setUint16(x+2,24,true);h.setBigUint64(x+4,size,true);h.setBigUint64(x+12,size,true);h.setBigUint64(x+20,BigInt(offset),true)
    parts.push(local,asset.file);central.push(header);centralSize+=header.length;offset+=local.length+asset.file.size
  }
  const end=new Uint8Array(98),e=view(end),count=BigInt(assets.length)
  e.setUint32(0,0x06064b50,true);e.setBigUint64(4,44n,true);e.setUint16(12,45,true);e.setUint16(14,45,true);e.setBigUint64(24,count,true);e.setBigUint64(32,count,true);e.setBigUint64(40,BigInt(centralSize),true);e.setBigUint64(48,BigInt(offset),true)
  e.setUint32(56,0x07064b50,true);e.setBigUint64(64,BigInt(offset+centralSize),true);e.setUint32(72,1,true)
  e.setUint32(76,0x06054b50,true);e.setUint16(84,65535,true);e.setUint16(86,65535,true);e.setUint32(88,0xffffffff,true);e.setUint32(92,0xffffffff,true)
  return new Blob([...parts,...central,end],{type:'application/zip'})
}
