import { partBytes } from '../../../../../packages/shared/src/upload'
import type { CompressionLevel, ModelFormat } from './compatibility'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export type Health = { status: string; conversionAvailable: boolean }
export type JobSession = { id: string; token: string; expiresAt: number }
export type Session = JobSession & { reused?:boolean; uploadExpiresAt?: number; multipart?: {partSize:number;partCount:number}; uploadUrl: string; uploadHeaders: Record<string,string> }
export type JobStatus = { status: string; previewKind?: 'GLB' | 'PNG' | null; position?: number | null; etaSeconds?: number | null; progress?: number | null; originalBytes?: number; convertedBytes?: number | null; outputBytes?: number | null; reductionPercent?: number | null; compressionReductionPercent?: number | null; warning?: string | null; error?: string | null }

async function request<T>(path: string, options: RequestInit = {}, timeoutMs = 20000): Promise<T> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
  const response = await fetch(API_BASE + path, { ...options, signal, cache:'no-store', credentials:'omit' })
  if (!response.ok) {
    const body = await response.json().catch(()=>({}))
    throw new Error(typeof body.message === 'string' ? body.message : 'Conversion service returned HTTP ' + response.status)
  }
  return response.json() as Promise<T>
}
export const health = (signal: AbortSignal) => request<Health>('/health', {signal})
function auth(session: JobSession) { return {Authorization:'Bearer '+session.token} }
const jobPath = (session: JobSession) => '/jobs/'+encodeURIComponent(session.id)
export const createSession = (file:File,output:ModelFormat,compression:CompressionLevel,signal:AbortSignal, purpose: 'conversion' | 'preview' = 'conversion') => request<Session>('/jobs/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size,outputFormat:output,compression,color:null,purpose}),signal})
export const submit = (session:JobSession,signal:AbortSignal) => request<JobStatus>(jobPath(session)+'/submit',{method:'POST',headers:auth(session),signal},90000)
export const status = (session:JobSession,signal:AbortSignal) => request<JobStatus>(jobPath(session),{headers:auth(session),signal})
export const cancel = (session:JobSession) => request<JobStatus>(jobPath(session),{method:'DELETE',headers:auth(session)})
export const download = (session:JobSession) => request<{url:string;filename:string}>(jobPath(session)+'/download',{headers:auth(session)})

export async function upload(session:Session,file:File,signal:AbortSignal,progress:(percent:number)=>void):Promise<void> {
  if(!session.multipart)return singleUpload(session,file,signal,progress)
  const {partSize,partCount}=session.multipart
  if(!Number.isSafeInteger(partSize)||partSize<5*1024**2||!Number.isSafeInteger(partCount)||partCount!==Math.ceil(file.size/partSize)||partCount>10000)throw new Error('Invalid upload session')
  const controller=new AbortController()
  const combined=AbortSignal.any([signal,controller.signal])
  let next=1,completed=0
  const inFlight=new Map<number,number>()
  let firstError:unknown
  function report(){progress(Math.min(100,Math.floor((completed+[...inFlight.values()].reduce((a,b)=>a+b,0))/file.size*100)))}
  async function transfer(part:number){
    const bytes=partBytes(file.size,partSize,part)
    const blob=file.slice((part-1)*partSize,(part-1)*partSize+bytes)
    for(let attempt=0;attempt<4;attempt++){
      combined.throwIfAborted()
      if(Date.now()>=(session.uploadExpiresAt??session.expiresAt))throw new Error('Upload session expired')
      try{
        const signed=await request<{parts:{part:number;url:string}[]}>(jobPath(session)+'/parts',{method:'POST',headers:{...auth(session),'Content-Type':'application/json'},body:JSON.stringify({parts:[part]}),signal:combined})
        const url=signed.parts.find(p=>p.part===part)?.url
        if(!url)throw new Error('Missing signed upload part')
        await putPart(url,blob,combined,loaded=>{inFlight.set(part,loaded);report()})
        inFlight.delete(part);completed+=bytes;report();return
      }catch(error){
        inFlight.delete(part);report()
        combined.throwIfAborted()
        if(attempt===3)throw error
        await wait(1000*2**attempt,combined)
      }
    }
  }
  // Bound browser memory and network concurrency. Fresh URLs are issued as needed,
  // and failed parts alone are retried; no full-file read or API proxy.
  await Promise.allSettled(Array.from({length:Math.min(3,partCount)},async()=>{
    try{while(next<=partCount){combined.throwIfAborted();await transfer(next++)}}
    catch(error){firstError??=error;controller.abort();throw error}
  }))
  if(firstError)throw firstError
  combined.throwIfAborted()
  if(completed!==file.size)throw new Error('Multipart upload incomplete')
}
function putPart(url:string,blob:Blob,signal:AbortSignal,progress:(bytes:number)=>void):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const xhr=new XMLHttpRequest()
    const abort=()=>xhr.abort()
    const clean=()=>signal.removeEventListener('abort',abort)
    xhr.open('PUT',url)
    xhr.timeout=10*60*1000
    xhr.upload.onprogress=e=>progress(Math.min(blob.size,e.loaded))
    xhr.onload=()=>{clean();if(xhr.status>=200&&xhr.status<300)resolve();else reject(new Error('Storage part upload failed ('+xhr.status+')'))}
    xhr.onerror=()=>{clean();reject(new Error('Storage part connection failed'))}
    xhr.ontimeout=()=>{clean();reject(new Error('Storage part timed out'))}
    xhr.onabort=()=>{clean();reject(new DOMException('Cancelled','AbortError'))}
    signal.addEventListener('abort',abort,{once:true})
    xhr.send(blob)
  })
}
function singleUpload(session:Session,file:File,signal:AbortSignal,progress:(percent:number)=>void):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const xhr=new XMLHttpRequest()
    const abort=()=>xhr.abort()
    const clean=()=>signal.removeEventListener('abort',abort)
    xhr.open('PUT',session.uploadUrl)
    xhr.timeout=Math.max(1000, Math.min(30*60*1000,(session.uploadExpiresAt??Date.now()+15*60*1000)-Date.now()))
    for(const [name,value] of Object.entries(session.uploadHeaders)) if(name.toLowerCase()!=='content-length')xhr.setRequestHeader(name,value)
    xhr.upload.onprogress=event=>{if(event.lengthComputable)progress(Math.min(100,Math.round(event.loaded/event.total*100)))}
    xhr.onload=()=>{clean();if(xhr.status>=200&&xhr.status<300)resolve();else reject(new Error('Storage upload rejected ('+xhr.status+'). Check the storage/CORS configuration.'))}
    xhr.onerror=()=>{clean();reject(new Error('Storage upload failed. Check your connection and storage CORS.'))}
    xhr.ontimeout=()=>{clean();reject(new Error('Storage upload timed out.'))}
    xhr.onabort=()=>{clean();reject(new DOMException('Cancelled','AbortError'))}
    signal.addEventListener('abort',abort,{once:true})
    xhr.send(file)
  })
}
export function wait(ms:number,signal:AbortSignal) {
  return new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}

export async function fetchPreview(session:JobSession,expectedBytes:number,signal:AbortSignal):Promise<Blob>{
  const max=10*1024*1024
  if(!Number.isSafeInteger(expectedBytes)||expectedBytes<1||expectedBytes>max)throw new Error('Preview size limit')
  const signed=await request<{url:string}>(jobPath(session)+'/download',{headers:auth(session),signal})
  const response=await fetch(signed.url,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)]),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})
  if(!response.ok||!response.body)throw new Error('Preview download unavailable')
  const reader=response.body.getReader()
  const chunks:Uint8Array<ArrayBuffer>[]=[]
  let total=0
  try{
    while(true){
      const {done,value}=await reader.read()
      if(done)break
      total+=value.byteLength
      if(total>expectedBytes||total>max)throw new Error('Preview size limit')
      chunks.push(new Uint8Array(value))
    }
    if(total!==expectedBytes)throw new Error('Preview size mismatch')
    return new Blob(chunks)
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}

export const createOutputPreview = (session:JobSession, signal:AbortSignal) => request<JobSession>(jobPath(session)+'/preview',{method:'POST',headers:auth(session),signal},90000)

export type BatchSession=JobSession
export const createBatch=(operation:'conversion'|'compression',signal:AbortSignal)=>request<BatchSession>('/jobs/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation}),signal})
export const createBatchUpload=(batch:BatchSession,file:File,filename:string,output:ModelFormat,compression:CompressionLevel,signal:AbortSignal,bundleEntry?:string,packageOutput=false,purpose:'conversion'|'preview'='conversion',reuseSource?:JobSession)=>request<Session>('/jobs/batches/'+encodeURIComponent(batch.id)+'/uploads',{method:'POST',headers:{...auth(batch),'Content-Type':'application/json'},body:JSON.stringify({filename,size:file.size,outputFormat:output,compression,color:null,purpose,...(bundleEntry?{bundleEntry}:{}),...(packageOutput?{packageOutput:true}:{}),...(reuseSource?{reuseSource:{id:reuseSource.id,token:reuseSource.token}}:{})}),signal},90000)
