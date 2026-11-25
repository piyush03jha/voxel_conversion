import { useEffect, useRef, useState } from 'react'
import type { CompressionLevel, ModelFormat } from './compatibility'
import { outputName } from './browser-route'
import { convertLocally } from './browser-client'
import * as api from './conversion-client'
import type { Session, JobStatus } from './conversion-client'

type Route = 'browser' | 'server'
type Result = { name:string; bytes:number; originalBytes:number; convertedBytes:number|null; warning:string|null; blob?:Blob; session?:Session }
type State = { busy:boolean; stage:string; progress:number|null; position:number|null; eta:number|null; route:Route|null; error:string|null; fallback:boolean; result:Result|null }
const empty:State={busy:false,stage:'Ready',progress:null,position:null,eta:null,route:null,error:null,fallback:false,result:null}
type Run = { controller:AbortController; session?:Session; submitted:boolean; submissionStarted:boolean; cancelling:boolean; cancelled:boolean }
const terminal = ['completed','failed','expired','cancelled']
export function useConversion(){
  const [state,setState]=useState<State>(empty)
  const [downloadError,setDownloadError]=useState('')
  const [downloading,setDownloading]=useState(false)
  const active=useRef<Run|null>(null)
  const mounted=useRef(true)
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;const run=active.current;run?.controller.abort();if(run?.session&&!run.submitted)void api.cancel(run.session).catch(()=>undefined)}},[])
  const patch=(run:Run,value:Partial<State>)=>{if(mounted.current&&active.current===run)setState(prev=>({...prev,...value}))}
  function reset(){if(!active.current){setState(empty);setDownloadError('')}}
  async function start(file:File,input:ModelFormat,output:ModelFormat,compression:CompressionLevel,route:Route){
    if(active.current)return
    const run:Run={controller:new AbortController(),submitted:false,submissionStarted:false,cancelling:false,cancelled:false}
    active.current=run
    const signal=run.controller.signal
    setDownloadError('')
    setState({...empty,busy:true,route,stage:route==='browser'?'Processing on your device':'Reserving queue slot'})
    try{
      const name=outputName(file.name,output)
      if(route==='browser'){
        const blob=await convertLocally(file,input,output,signal)
        patch(run,{stage:'Completed locally',progress:100,result:{name,bytes:blob.size,originalBytes:file.size,convertedBytes:blob.size,warning:input==='GLB'||input==='GLTF'?null:'Geometry-only browser export. Original normals, smoothing groups and advanced scene features are not retained.',blob}})
      }else{
        const session=await api.createSession(file,output,compression,signal)
        run.session=session
        signal.throwIfAborted()
        patch(run,{stage:'Uploading to private storage',progress:0})
        await api.upload(session,file,signal,percent=>patch(run,{progress:percent}))
        patch(run,{stage:'Submitting job',progress:null})
        // Retry submit once on uncertain network failure; server job id is idempotent.
        run.submissionStarted=true
        try{await api.submit(session,signal)}catch(error){signal.throwIfAborted();await api.submit(session,signal).catch(()=>{throw error})}
        run.submitted=true
        let failures=0
        while(true){
          signal.throwIfAborted()
          if(Date.now()>=session.expiresAt)throw new Error('Job expired.')
          let job:JobStatus
          try{job=await api.status(session,signal);failures=0}catch(error){if(++failures>=5)throw error;await api.wait(2500,signal);continue}
          if(job.status==='completed'){
            if(typeof job.outputBytes!=='number'||job.outputBytes<=0)throw new Error('Server did not return a valid output size.')
            patch(run,{stage:'Completed on server',progress:100,position:null,eta:null,result:{name,bytes:job.outputBytes,originalBytes:file.size,convertedBytes:job.convertedBytes??null,warning:job.warning??null,session}})
            break
          }
          if(terminal.includes(job.status))throw new Error(job.status==='cancelled'?'Job cancelled.':job.error??'Conversion '+job.status+'.')
          patch(run,{stage:job.status==='active'?'Converting on server':job.status==='waiting'?'Waiting in queue':'Job: '+job.status,progress:job.status==='active'?job.progress??null:null,position:job.position??null,eta:job.etaSeconds??null})
          await api.wait(1500,signal)
        }
      }
    }catch(error){
      if(run.session&&!run.submitted)void api.cancel(run.session).catch(()=>undefined)
      if(run.cancelled||signal.aborted)patch(run,{stage:'Cancelled',error:null})
      else patch(run,{stage:'Conversion not completed',error:(error instanceof Error?error.message:'Conversion failed.')+(run.submissionStarted?' A server job may still exist if its status could not be retrieved; it expires automatically.':''),fallback:route==='browser'})
    }finally{patch(run,{busy:false});if(active.current===run)active.current=null}
  }
  async function cancelCurrent(){
    const run=active.current
    if(!run||run.cancelling)return
    run.cancelling=true
    if(run.session&&run.submissionStarted){
      try{
        await api.cancel(run.session)
        run.cancelled=true;run.controller.abort()
      }catch(error){patch(run,{error:error instanceof Error?error.message:'Server job could not be cancelled.'})}
      finally{run.cancelling=false}
    }else{
      run.cancelled=true;run.controller.abort()
      if(run.session)void api.cancel(run.session).catch(()=>undefined)
    }
  }
  async function downloadResult(){
    const result=state.result
    if(!result||downloading)return
    setDownloading(true);setDownloadError('')
    let objectUrl:string|undefined
    try{
      const link=document.createElement('a')
      if(result.blob){objectUrl=URL.createObjectURL(result.blob);link.href=objectUrl;link.download=result.name}
      else if(result.session){const signed=await api.download(result.session);link.href=signed.url;link.download=signed.filename;link.rel='noreferrer'}
      else throw new Error('Output unavailable.')
      document.body.append(link);link.click();link.remove()
    }catch(error){setDownloadError(error instanceof Error?error.message:'Download failed.')}
    finally{if(objectUrl){const url=objectUrl;setTimeout(()=>URL.revokeObjectURL(url),60000)}setDownloading(false)}
  }
  return {state,start,reset,cancelCurrent,downloadResult,downloading,downloadError}
}
