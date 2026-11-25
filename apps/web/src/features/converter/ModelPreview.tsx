import { useEffect, useRef, useState } from 'react'
import SampleViewport from './SampleViewport'
import type { Result } from './use-conversion'
import * as api from './conversion-client'
import type { JobSession } from './conversion-client'
import { getFormatFromFilename, MAX_UPLOAD_BYTES } from './compatibility'
import { LOCAL_MAX_BYTES } from './browser-route'

export function canPreview(name:string,bytes:number){
  const format=getFormatFromFilename(name)
  return typeof Worker!=='undefined' && !!format && ['STL','OBJ','PLY','GLB','GLTF'].includes(format) && bytes>0 && bytes<=LOCAL_MAX_BYTES
}
type Target = 'input' | 'output'
type Preview = { kind:'GLB'; file:File } | { kind:'PNG'; blob:Blob }
type State = { stage:string; preview?:Preview; error?:string }
type Run = { controller:AbortController; session?:JobSession; target:Target }

function RasterPreview({blob}:{blob:Blob}){
  const [url,setUrl]=useState('')
  useEffect(()=>{const next=URL.createObjectURL(blob);setUrl(next);return()=>URL.revokeObjectURL(next)},[blob])
  return url?<img className="document-preview" src={url} alt="Rendered document preview"/>:<div className="scene-loading">Preparing document preview…</div>
}

export default function ModelPreview({file,result,busy,serverReady}:{file:File|null;result:Result|null;busy:boolean;serverReady:boolean}){
  const [target,setTarget]=useState<Target>('input')
  const [states,setStates]=useState<Partial<Record<Target,State>>>({})
  const [running,setRunning]=useState<Target|null>(null)
  const runRef=useRef<Run|null>(null)
  const selected=target==='output'&&result?'output':'input'
  const current=states[selected]
  const name=selected==='input'?file?.name:result?.name
  const size=selected==='input'?file?.size:result?.bytes
  const local=!!name&&!!size&&canPreview(name,size)
  const source=selected==='input'?file:null
  const [localFile,setLocalFile]=useState<{result:Result;file:File}|null>(null)
  const [localError,setLocalError]=useState<Result|null>(null)

  // Only fetch an already completed, small output when the user selects Output.
  useEffect(()=>{
    if(selected!=='output'||!result||!local||busy||current?.preview||localFile?.result===result||localError===result)return
    const controller=new AbortController(),record=result
    async function load(){
      try{
        const blob=record.blob??(record.session?await api.fetchPreview(record.session,record.bytes,controller.signal):null)
        if(!blob)throw new Error('No output')
        if(!controller.signal.aborted)setLocalFile({result:record,file:new File([blob],record.name)})
      }catch{if(!controller.signal.aborted)setLocalError(record)}
    }
    void load()
    return()=>controller.abort()
  },[selected,result,local,busy,current?.preview,localFile,localError])

  function stop(){
    const run=runRef.current
    if(!run)return
    runRef.current=null
    run.controller.abort()
    if(run.session)void api.cancel(run.session).catch(()=>undefined)
    setRunning(null)
    setStates(prev=>({...prev,[run.target]:{stage:'Preview stopped. A running server job may continue until expiry.'}}))
  }
  useEffect(()=>{
    if(busy)stop()
    // Unmount releases browser references and cancels a queued preview if possible.
    return undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[busy])
  useEffect(()=>()=>{const run=runRef.current;runRef.current=null;run?.controller.abort();if(run?.session)void api.cancel(run.session).catch(()=>undefined)},[])

  async function generate(){
    if(busy||runRef.current||!serverReady||!name||!size||size>MAX_UPLOAD_BYTES)return
    const run:Run={controller:new AbortController(),target:selected}
    const signal=run.controller.signal
    runRef.current=run;setRunning(selected)
    const update=(state:State)=>{if(runRef.current===run)setStates(prev=>({...prev,[run.target]:state}))}
    update({stage:'Requesting server preview…'})
    try{
      let session:JobSession
      if(selected==='output'&&result?.session){
        session=await api.createOutputPreview(result.session,signal)
        run.session=session
      }else{
        const uploadFile=selected==='input'?file:result?.blob?new File([result.blob],result.name):null
        if(!uploadFile)throw new Error('Preview source unavailable')
        const uploadSession=await api.createSession(uploadFile,'GLB','None',signal,'preview')
        run.session=uploadSession
        await api.upload(uploadSession,uploadFile,signal,percent=>update({stage:'Uploading for preview · '+percent+'%'}))
        session=uploadSession
        await api.submit(session,signal)
      }
      signal.throwIfAborted()
      // Deadline bounds browser polling; server retains its own queue and processing limits.
      const deadline=Math.min(session.expiresAt,Date.now()+15*60*1000)
      while(Date.now()<deadline){
        const job=await api.status(session,signal)
        if(job.status==='completed'){
          if(!job.outputBytes||!job.previewKind)throw new Error('Invalid preview response')
          update({stage:'Loading generated preview…'})
          const blob=await api.fetchPreview(session,job.outputBytes,signal)
          const preview:Preview=job.previewKind==='PNG'?{kind:'PNG',blob}:{kind:'GLB',file:new File([blob],'preview.glb')}
          update({stage:'Preview ready',preview});return
        }
        if(['failed','expired','cancelled'].includes(job.status))throw new Error('Preview '+job.status+'. The model may be unsupported or too complex.')
        update({stage:job.status==='active'?'Generating bounded preview…':'Preview waiting for a worker…'})
        await api.wait(2500,signal)
      }
      throw new Error('Preview wait limit reached. Try again later.')
    }catch(error){
      if(!signal.aborted)update({stage:'Preview unavailable',error:error instanceof Error?error.message:'Preview failed'})
    }finally{
      if(run.session)void api.cancel(run.session).catch(()=>undefined)
      if(runRef.current===run){runRef.current=null;setRunning(null)}
    }
  }
  const generated=current?.preview
  const previewFile=busy?null:generated?.kind==='GLB'?generated.file:local?(source??(localFile && localFile.result===result?localFile.file:null)):null
  const raster=!busy&&generated?.kind==='PNG'?generated.blob:null
  const message=busy?'Preview paused during processing.':running===selected?current?.stage??'Generating preview…':current?.error??(generated?'':selected==='output'&&local&&localError!==result&&!previewFile?'Loading output preview…':name&&!previewFile&&!raster?'Generate a server preview for this format or model.':'')
  const canGenerate=!!name&&!!size&&size<=MAX_UPLOAD_BYTES&&serverReady&&!busy&&!running
  return <>
    {raster?<RasterPreview blob={raster}/>:message?<div className="scene-loading preview-message" role="status">{message}</div>:<SampleViewport file={previewFile}/>}
    <div className="preview-label"><span className="live-dot"/> {busy?'PROCESSING':raster?'DOCUMENT PREVIEW':previewFile?selected==='output'?'OUTPUT GEOMETRY':'INPUT GEOMETRY':name?'MODEL PREVIEW':'INTERACTIVE SAMPLE SCENE'}</div>
    {result&&<div className="preview-switch" role="group" aria-label="Preview source">
      <button type="button" aria-pressed={selected==='input'} disabled={!!running||busy} onClick={()=>setTarget('input')}>Input</button>
      <button type="button" aria-pressed={selected==='output'} disabled={!!running||busy} onClick={()=>setTarget('output')}>Output</button>
    </div>}
    {name&&!busy&&<div className="preview-tools">
      {running?<button type="button" onClick={stop}>Stop preview</button>:!generated&&<button type="button" disabled={!canGenerate} onClick={()=>void generate()}>{selected==='output'&&result?.session?'Generate server preview from stored output':'Upload & generate server preview'}</button>}
      {!serverReady&&!local&&<small>Server preview requires an online worker.</small>}
    </div>}
    {!raster&&<><span className="axis-label axis-x">X</span><span className="axis-label axis-y">Y</span><span className="axis-label axis-z">Z</span></>}
    <div className="preview-footer"><span>{raster?'Raster preview · first page for PDF':previewFile?'Static geometry · materials and animation not shown':name?'Preview does not change the exported file':'Sample geometry · select a model'}</span><span>{raster?'2D VIEW':'GL VIEWPORT'}</span></div>
  </>
}
