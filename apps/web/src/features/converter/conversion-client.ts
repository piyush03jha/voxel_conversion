import type { CompressionLevel, ModelFormat } from './compatibility'

export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export type Health = { status: string; conversionAvailable: boolean }
export type Session = { id: string; token: string; uploadUrl: string; uploadHeaders: Record<string,string>; expiresAt: number }
export type JobStatus = { status: string; position?: number | null; etaSeconds?: number | null; progress?: number | null; originalBytes?: number; convertedBytes?: number | null; outputBytes?: number | null; reductionPercent?: number | null; compressionReductionPercent?: number | null; warning?: string | null; error?: string | null }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
  const response = await fetch(API_BASE + path, { ...options, signal, cache:'no-store', credentials:'omit' })
  if (!response.ok) {
    const body = await response.json().catch(()=>({}))
    throw new Error(typeof body.message === 'string' ? body.message : 'Conversion service returned HTTP ' + response.status)
  }
  return response.json() as Promise<T>
}
export const health = (signal: AbortSignal) => request<Health>('/health', {signal})
function auth(session: Session) { return {Authorization:'Bearer '+session.token} }
const jobPath = (session: Session) => '/jobs/'+encodeURIComponent(session.id)
export const createSession = (file:File,output:ModelFormat,compression:CompressionLevel,signal:AbortSignal) => request<Session>('/jobs/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:file.name,size:file.size,outputFormat:output,compression,color:null}),signal})
export const submit = (session:Session,signal:AbortSignal) => request<JobStatus>(jobPath(session)+'/submit',{method:'POST',headers:auth(session),signal})
export const status = (session:Session,signal:AbortSignal) => request<JobStatus>(jobPath(session),{headers:auth(session),signal})
export const cancel = (session:Session) => request<JobStatus>(jobPath(session),{method:'DELETE',headers:auth(session)})
export const download = (session:Session) => request<{url:string;filename:string}>(jobPath(session)+'/download',{headers:auth(session)})

export function upload(session:Session,file:File,signal:AbortSignal,progress:(percent:number)=>void):Promise<void> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const xhr=new XMLHttpRequest()
    const abort=()=>xhr.abort()
    const clean=()=>signal.removeEventListener('abort',abort)
    xhr.open('PUT',session.uploadUrl)
    xhr.timeout=15*60*1000
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

export async function fetchPreview(session:Session,expectedBytes:number,signal:AbortSignal):Promise<Blob>{
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
