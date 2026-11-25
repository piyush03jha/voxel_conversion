import { useEffect, useRef, useState } from 'react'
import type { CompressionLevel, ModelFormat } from './compatibility'
import { outputName } from './browser-route'
import { convertLocally } from './browser-client'
import * as api from './conversion-client'
import type { Session, JobStatus } from './conversion-client'

type Route = 'browser' | 'server'
export type Result = { name:string; bytes:number; originalBytes:number; convertedBytes:number|null; warning:string|null; blob?:Blob; session?:Session }
type State = { busy:boolean; stage:string; progress:number|null; position:number|null; eta:number|null; route:Route|null; error:string|null; fallback:boolean; result:Result|null; canResume:boolean; serverStatus:string|null }
const empty:State={busy:false,stage:'Ready',progress:null,position:null,eta:null,route:null,error:null,fallback:false,result:null,canResume:false,serverStatus:null}
type Pending = { session:Session; name:string; originalBytes:number }
type Run = { controller:AbortController; session?:Session; submissionStarted:boolean; cancelling:boolean; cancelled:boolean; pause:boolean }
const terminal = ['completed','failed','expired','cancelled']
export function useConversion(){
  const [state,setState]=useState<State>(empty)
  const [downloadError,setDownloadError]=useState('')
  const [downloading,setDownloading]=useState(false)
  const active=useRef<Run|null>(null)
  const pending=useRef<Pending|null>(null)
  const mounted=useRef(true)
  const downloadingRef=useRef(false)
  useEffect(()=>{
    mounted.current=true
    return()=>{
      mounted.current=false
      const run=active.current
      run?.controller.abort()
      if(run?.session&&!run.submissionStarted)void api.cancel(run.session).catch(()=>undefined)
    }
  },[])
  function patch(run:Run,value:Partial<State>){if(mounted.current&&active.current===run)setState(prev=>({...prev,...value}))}
  function reset(){
    if(active.current||downloadingRef.current)return
    pending.current=null;setState(empty);setDownloadError('')
  }
  function newRun():Run{
    const run:Run={controller:new AbortController(),submissionStarted:false,cancelling:false,cancelled:false,pause:false}
    active.current=run
    return run
  }
  function finish(run:Run){patch(run,{busy:false});if(active.current===run)active.current=null}
  async function track(run:Run,record:Pending){
    const signal=run.controller.signal
    let failures=0
    while(true){
      signal.throwIfAborted()
      if(Date.now()>=record.session.expiresAt){pending.current=null;patch(run,{stage:'Job expired',error:'The server retention period has ended.',canResume:false});return}
      let job:JobStatus
      try{
        job=await api.status(record.session,signal)
        if(job.status==='awaiting-upload'){
          // We only retain a pending record after upload succeeds. Re-submit the same ID,
          // never create a second upload/job. Server submit is idempotent.
          await api.submit(record.session,signal)
          await api.wait(1000,signal)
          continue
        }
        failures=0
      }catch(error){
        signal.throwIfAborted()
        if(++failures>=5)throw error
        patch(run,{stage:'Reconnecting to server',error:null,progress:null,position:null,eta:null})
        await api.wait(Math.min(10000,2000*failures),signal);continue
      }
      if(job.status==='completed'){
        pending.current=null
        if(typeof job.outputBytes!=='number'||job.outputBytes<=0){
          patch(run,{stage:'Output unavailable',error:'Server did not return a valid output size.',canResume:false});return
        }
        patch(run,{stage:'Completed on server',progress:100,position:null,eta:null,error:null,canResume:false,serverStatus:'completed',result:{name:record.name,bytes:job.outputBytes,originalBytes:record.originalBytes,convertedBytes:job.convertedBytes??null,warning:job.warning??null,session:record.session}})
        return
      }
      if(terminal.includes(job.status)){
        pending.current=null
        patch(run,{stage:job.status==='cancelled'?'Cancelled':'Conversion '+job.status,error:job.status==='cancelled'?null:job.error??'Conversion '+job.status+'.',canResume:false,serverStatus:job.status,progress:null,position:null,eta:null})
        return
      }
      patch(run,{stage:job.status==='active'?'Converting on server':job.status==='waiting'?'Waiting in queue':'Job: '+job.status,serverStatus:job.status,progress:job.status==='active'?job.progress??null:null,position:job.position??null,eta:job.etaSeconds??null})
      await api.wait(2500,signal)
    }
  }
  function handleFailure(run:Run,error:unknown,route:Route){
    const record=pending.current
    if(run.cancelled){
      pending.current=null
      patch(run,{stage:'Cancelled',error:null,canResume:false,progress:null,position:null,eta:null});return
    }
    if(record&&run.submissionStarted){
      patch(run,{stage:'Tracking paused',error:run.pause?null:'Connection interrupted. Resume tracking without uploading the file again.',canResume:true,progress:null,position:null,eta:null});return
    }
    if(run.session)void api.cancel(run.session).catch(()=>undefined)
    patch(run,{stage:'Conversion not completed',error:error instanceof Error?error.message:'Conversion failed.',fallback:route==='browser',progress:null})
  }
  async function start(file:File,input:ModelFormat,output:ModelFormat,compression:CompressionLevel,route:Route){
    if(active.current||pending.current||downloadingRef.current)return
    const run=newRun(),signal=run.controller.signal
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
        signal.throwIfAborted()
        const record:Pending={session,name,originalBytes:file.size}
        pending.current=record
        run.submissionStarted=true
        patch(run,{stage:'Submitting job',progress:null})
        // Status reconciliation handles uncertainty from submission without duplicate jobs.
        try{await api.submit(session,signal)}catch{signal.throwIfAborted()}
        await track(run,record)
      }
    }catch(error){handleFailure(run,error,route)}
    finally{finish(run)}
  }
  async function resumeTracking(){
    const record=pending.current
    if(!record||active.current)return
    const run=newRun();run.session=record.session;run.submissionStarted=true
    patch(run,{busy:true,canResume:false,stage:'Reconnecting to server',error:null})
    try{await track(run,record)}catch(error){handleFailure(run,error,'server')}finally{finish(run)}
  }
  function pauseTracking(){
    const run=active.current
    if(!run?.submissionStarted||!pending.current||run.cancelling)return
    run.pause=true;run.controller.abort()
  }
  async function cancelCurrent(){
    const run=active.current
    if(!run||run.cancelling)return
    run.cancelling=true
    if(run.session&&run.submissionStarted){
      try{
        await api.cancel(run.session)
        if(active.current!==run)return
        run.cancelled=true;pending.current=null;run.controller.abort()
      }catch(error){patch(run,{error:error instanceof Error?error.message:'Server job could not be cancelled.'})}
      finally{run.cancelling=false}
    }else{
      run.cancelled=true;run.controller.abort()
      if(run.session)void api.cancel(run.session).catch(()=>undefined)
    }
  }
  async function downloadResult(){
    const result=state.result
    if(!result||downloadingRef.current)return
    downloadingRef.current=true;setDownloading(true);setDownloadError('')
    let objectUrl:string|undefined
    try{
      const link=document.createElement('a')
      if(result.blob){objectUrl=URL.createObjectURL(result.blob);link.href=objectUrl;link.download=result.name}
      else if(result.session){const signed=await api.download(result.session);link.href=signed.url;link.download=signed.filename;link.rel='noreferrer';link.referrerPolicy='no-referrer'}
      else throw new Error('Output unavailable.')
      document.body.append(link);link.click();link.remove()
    }catch(error){if(mounted.current)setDownloadError(error instanceof Error?error.message:'Download failed.')}
    finally{
      if(objectUrl){const url=objectUrl;setTimeout(()=>URL.revokeObjectURL(url),60000)}
      downloadingRef.current=false;if(mounted.current)setDownloading(false)
    }
  }
  return {state,start,reset,cancelCurrent,downloadResult,downloading,downloadError,resumeTracking,pauseTracking}
}
