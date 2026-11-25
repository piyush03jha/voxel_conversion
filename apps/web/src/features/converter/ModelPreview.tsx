import { useEffect, useState } from 'react'
import SampleViewport from './SampleViewport'
import type { Result } from './use-conversion'
import { fetchPreview } from './conversion-client'
import { getFormatFromFilename } from './compatibility'
import { LOCAL_MAX_BYTES } from './browser-route'

export function canPreview(name:string,bytes:number){
  const format=getFormatFromFilename(name)
  return typeof Worker!=='undefined' && !!format && ['STL','OBJ','PLY','GLB','GLTF'].includes(format) && bytes>0 && bytes<=LOCAL_MAX_BYTES
}
export default function ModelPreview({file,result,busy}:{file:File|null;result:Result|null;busy:boolean}){
  const [showOutput,setShowOutput]=useState(false)
  const [loaded,setLoaded]=useState<{result:Result;file:File}|null>(null)
  const [error,setError]=useState<{result:Result;message:string}|null>(null)
  const sourceAvailable=!!file&&canPreview(file.name,file.size)
  const outputAvailable=!!result&&canPreview(result.name,result.bytes)
  // Output is explicitly selected, never fetched automatically from storage.
  useEffect(()=>{
    if(!showOutput||!result||!outputAvailable||busy||loaded?.result===result||error?.result===result)return
    const controller=new AbortController()
    const current=result
    async function load(){
      try{
        const blob=current.blob??(current.session?await fetchPreview(current.session,current.bytes,controller.signal):null)
        if(!blob)throw new Error('No output')
        if(!controller.signal.aborted)setLoaded({result:current,file:new File([blob],current.name)})
      }catch{
        if(!controller.signal.aborted)setError({result:current,message:'Output preview unavailable. Download the model instead.'})
      }
    }
    void load()
    return()=>controller.abort()
  },[showOutput,result,outputAvailable,busy,loaded,error])
  const outputSelected=showOutput&&!!result
  const preview=busy?null:outputSelected?(loaded?.result===result?loaded.file:null):sourceAvailable?file:null
  const message=busy?'Preview paused during processing to reduce memory usage.':outputSelected?(error?.result===result?error.message:!outputAvailable?'This output format or size cannot be previewed locally.':!preview?'Loading output preview…':''):file&&!sourceAvailable?'Input preview unavailable for this format or size. You can still convert the file.':''
  return <>
    {message?<div className="scene-loading preview-message" role="status">{message}</div>:<SampleViewport file={preview}/>}
    <div className="preview-label"><span className="live-dot"/> {busy?'PROCESSING':preview?outputSelected?'OUTPUT GEOMETRY':'INPUT GEOMETRY':file?'PREVIEW UNAVAILABLE':'INTERACTIVE SAMPLE SCENE'}</div>
    {result&&<div className="preview-switch" role="group" aria-label="Preview source">
      <button type="button" aria-pressed={!outputSelected} onClick={()=>setShowOutput(false)}>Input</button>
      <button type="button" aria-pressed={outputSelected} disabled={!outputAvailable||busy} onClick={()=>setShowOutput(true)}>Output</button>
    </div>}
    <span className="axis-label axis-x">X</span><span className="axis-label axis-y">Y</span><span className="axis-label axis-z">Z</span>
    <div className="preview-footer"><span>{preview?'Geometry-only preview · materials and animation not shown':file?'Preview does not affect conversion':'Sample geometry · select a model'}</span><span>GL VIEWPORT</span></div>
  </>
}
