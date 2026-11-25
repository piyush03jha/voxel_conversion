import type { ModelFormat } from './compatibility'

export function convertLocally(file: File, input: ModelFormat, output: ModelFormat, signal: AbortSignal): Promise<Blob> {
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Cancelled','AbortError'));return}
    const worker=new Worker(new URL('./browser-conversion.worker.ts',import.meta.url),{type:'module'})
    const finish=(error?: Error,blob?:Blob)=>{
      clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate()
      if(error)reject(error);else if(blob)resolve(blob);else reject(new Error('No local output'))
    }
    const abort=()=>finish(new DOMException('Cancelled','AbortError'))
    const timer=setTimeout(()=>finish(new Error('Browser conversion exceeded its 30-second limit. Use server processing instead.')),30000)
    signal.addEventListener('abort',abort,{once:true})
    worker.onmessage=(event:MessageEvent<{ok:boolean;blob?:Blob;error?:string}>)=>event.data.ok?finish(undefined,event.data.blob):finish(new Error(event.data.error??'Local conversion failed'))
    worker.onerror=()=>finish(new Error('Browser converter failed. Use server processing instead.'))
    worker.postMessage({file,input,output})
  })
}
