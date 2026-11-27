import {useEffect,useRef,useState} from 'react'
import {VoxelNav,VoxelCredit,PrintNextStep,printableFormat} from '../guides/VoxelLinks'
import type {ChangeEvent,DragEvent} from 'react'
import {ACCEPTED_FORMATS,getCompressionLevels,getOutputGroups,isConversionSupported,getOutputWarning} from '../converter/compatibility'
import type {ModelFormat,CompressionLevel} from '../converter/compatibility'
import {browserRoute,outputName} from '../converter/browser-route'
import {convertLocally} from '../converter/browser-client'
import * as api from '../converter/conversion-client'
import type {Session,BatchSession,JobStatus} from '../converter/conversion-client'
import type {Result} from '../converter/use-conversion'
import ModelPreview from '../converter/ModelPreview'
import {Scratch,expandAssets,zipFiles} from './zip'
import type {Asset} from './zip'
import {discover,attachFolder} from './discover'
import type {Model} from './discover'
import {BATCH_MAX_ENTRIES,supportsPackage,supportsPackageExport} from '../../../../../packages/shared/src/batch'

type Pending={session:Session;uploaded:boolean;target:ModelFormat}
type Row={id:number;include:boolean;previewFile?:File;sourceSession?:Session;previewPending?:Session;previewUploaded?:boolean;packageFile?:File;model:Model;target:ModelFormat;state:'ready'|'working'|'done'|'failed'|'paused'|'skipped';stage:string;progress:number|null;result?:Result;pending?:Pending;error?:string}
function size(bytes:number){return bytes>=1024**3?(bytes/1024**3).toFixed(2)+' GB':bytes>=1024**2?(bytes/1024**2).toFixed(1)+' MB':Math.max(1,Math.round(bytes/1024))+' KB'}
function trigger(url:string,name:string,local=false){const a=document.createElement('a');a.href=url;a.download=name;a.rel='noreferrer';document.body.append(a);a.click();a.remove();if(local)setTimeout(()=>URL.revokeObjectURL(url),60000)}
function fileName(file:File){return file.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,180)}
function resultName(row:Row){return row.result?.name??outputName(fileName(row.model.asset.file),row.target)}
function zipName(row:Row){return String(row.id+1).padStart(3,'0')+'-'+resultName(row)}
function defaultTarget(model:Model,common:ModelFormat){return common!==model.format&&isConversionSupported(model.format,common)?common:getOutputGroups(model.format).recommended[0]??'GLB'}
export async function dropped(event:DragEvent):Promise<Asset[]>{
  // Capture all entries synchronously before the drag event is released.
  const items=Array.from(event.dataTransfer.items),entries=items.filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.()).filter((e):e is FileSystemEntry=>!!e)
  const fallback=Array.from(event.dataTransfer.files).map(file=>({path:file.webkitRelativePath||file.name,file}))
  if(!entries.length)return fallback
  const out:Asset[]=[];let count=0
  async function walk(entry:FileSystemEntry){
    if(++count>BATCH_MAX_ENTRIES)throw new Error('Folder entry limit exceeded')
    if(entry.isFile){const file=await new Promise<File>((resolve,reject)=>(entry as FileSystemFileEntry).file(resolve,reject));out.push({path:entry.fullPath.replace(/^\//,''),file});return}
    if(entry.isDirectory){const reader=(entry as FileSystemDirectoryEntry).createReader();while(true){const group=await new Promise<FileSystemEntry[]>((resolve,reject)=>reader.readEntries(resolve,reject));if(!group.length)break;for(const child of group)await walk(child)}}
  }
  for(const entry of entries)await walk(entry)
  return out
}

export default function BatchWorkspace({compress,singlePackage=false,initialAssets}:{compress:boolean;singlePackage?:boolean;initialAssets?:Promise<Asset[]>}){
  const assetsRef=useRef<Asset[]>([])
  const [rows,setRows]=useState<Row[]>([]),rowsRef=useRef<Row[]>([])
  const [common,setCommon]=useState<ModelFormat>('GLB'),[level,setLevel]=useState<CompressionLevel>('Medium')
  const [selected,setSelected]=useState(0),[scanning,setScanning]=useState(false),[working,setWorking]=useState(false),[packing,setPacking]=useState(false)
  const [message,setMessage]=useState(''),[error,setError]=useState(''),[serverReady,setServerReady]=useState(false),[stopRequested,setStopRequested]=useState(false)
  const [allowServer,setAllowServer]=useState(true)
  const operation=compress?'compression':'conversion'
  const scratch=useRef<Scratch>(new Scratch()),resultScratch=useRef<Scratch>(new Scratch())
  const cachedResults=useRef(new Map<number,Blob>())
  const batch=useRef<BatchSession|null>(null),active=useRef<AbortController|null>(null),stop=useRef(false),alive=useRef(true)
  const filesInput=useRef<HTMLInputElement>(null),folderInput=useRef<HTMLInputElement>(null)
  const locked=scanning||working||packing
  const pending=rows.some(row=>row.pending||row.previewPending)
  function replace(next:Row[]){rowsRef.current=next;if(alive.current)setRows(next)}
  function patch(id:number,value:Partial<Row>){replace(rowsRef.current.map(row=>row.id===id?{...row,...value}:row))}
  useEffect(()=>{
    alive.current=true
    const controller=new AbortController()
    let checking=false
    async function check(){if(checking)return;checking=true;try{const h=await api.health(controller.signal);if(!controller.signal.aborted)setServerReady(h.conversionAvailable)}catch{if(!controller.signal.aborted)setServerReady(false)}finally{checking=false}}
    void check();const timer=setInterval(()=>void check(),10000)
    return()=>{alive.current=false;controller.abort();active.current?.abort();clearInterval(timer);void scratch.current.close();void resultScratch.current.close()}
  },[])
  useEffect(()=>{if(!locked&&!pending)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[locked,pending])

  async function scan(load:()=>Promise<Asset[]>){
    if(active.current||pending)return
    const controller=new AbortController();active.current=controller
    const fresh=new Scratch()
    setScanning(true);setError('');setMessage('Scanning selected files…')
    try{
      const assets=await expandAssets(await load(),fresh,controller.signal,setMessage)
      setMessage('Detecting models and related assets…')
      const models=await discover(assets,controller.signal)
      if(!models.length)throw new Error('No supported models found. Add STL, OBJ, FBX, GLB, glTF, 3MF, PLY, USD variants, ABC, BVH, SVG or PDF.')
      const next=models.map((model,id):Row=>({id,include:!singlePackage||models.length===1,model,target:compress?model.format:defaultTarget(model,common),state:'ready',stage:'Ready',progress:null}))
      await scratch.current.close();scratch.current=fresh
      await resultScratch.current.close();resultScratch.current=new Scratch();cachedResults.current.clear()
      assetsRef.current=assets;batch.current=null;replace(next);setSelected(0);setMessage(models.length===1?'One main model detected · '+models[0].dependencies.length+' supporting assets':models.length+' possible main models found. '+(singlePackage?'Choose the main model below.':'Select independent models to process.'))
    }catch(e){await fresh.close();if(!controller.signal.aborted)setError(e instanceof Error?e.message:'File scan failed')}
    finally{if(active.current===controller)active.current=null;if(alive.current)setScanning(false)}
  }
  useEffect(()=>{
    if(!initialAssets)return
    let disposed=false
    void initialAssets.then(assets=>{if(!disposed)void scan(async()=>assets)},e=>{if(!disposed)setError(e instanceof Error?e.message:'Folder selection failed')})
    return()=>{disposed=true}
    // Initial drag selection is consumed only once per mounted package workspace.
  },[initialAssets])
  function pick(event:ChangeEvent<HTMLInputElement>){const assets=Array.from(event.currentTarget.files??[]).map(file=>({path:file.webkitRelativePath||file.name,file}));event.currentTarget.value='';if(assets.length)void scan(async()=>assets)}
  function reason(row:Row){
    if(row.model.error)return row.model.error
    if(row.model.needsAttachment)return 'Choose this main model and attach its supporting folder assets before processing.'
    if(!row.model.asset.file.size)return 'Empty model'
    if(compress){if((!row.model.dependencies.length&&!getCompressionLevels(row.model.format).includes(level))||level==='None')return 'Compression is unavailable for '+row.model.format}
    else if(row.target===row.model.format||!isConversionSupported(row.model.format,row.target))return 'Selected conversion is not supported'
    return ''
  }
  async function track(row:Row,p:Pending,signal:AbortSignal):Promise<JobStatus>{
    let failures=0
    while(Date.now()<p.session.expiresAt){
      signal.throwIfAborted()
      try{
        const status=await api.status(p.session,signal)
        if(status.status==='awaiting-upload'){
          if(!p.uploaded)throw new Error('Upload not finished')
          await api.submit(p.session,signal)
        }else if(['completed','failed','cancelled','expired'].includes(status.status))return status
        else patch(row.id,{state:'working',stage:status.status==='active'?'Processing on server':status.position?'Queue position '+status.position:'Waiting for worker',progress:status.progress??null})
        failures=0
      }catch(e){signal.throwIfAborted();if(++failures>=5)throw e;patch(row.id,{stage:'Reconnecting to server',progress:null});await api.wait(Math.min(10000,1000*failures),signal)}
      await api.wait(2000,signal)
    }
    return {status:'expired'}
  }
  async function processRow(original:Row,signal:AbortSignal){
    const row=rowsRef.current.find(r=>r.id===original.id)!
    const why=reason(row)
    if(why&&!row.pending){patch(row.id,{state:'skipped',stage:'Skipped',error:why});return true}
    const target=compress?row.model.format:row.target,compression=compress?level:'None'
    const model=row.model,source=model.asset.file
    const packaged=compress?model.dependencies.length>0:supportsPackageExport(target)
    const name=outputName(fileName(source),target)+(packaged?'.zip':'')
    patch(row.id,{state:'working',stage:'Preparing',progress:0,error:undefined})
    if(!row.pending&&!model.dependencies.length&&!packaged&&browserRoute(model.format,target,source.size,compression)){
      try{patch(row.id,{stage:'Processing locally',progress:null});const blob=await convertLocally(source,model.format,target,signal);patch(row.id,{state:'done',stage:'Completed in browser',progress:100,result:{name:resultName(row),bytes:blob.size,originalBytes:source.size,convertedBytes:null,warning:getOutputWarning(target),blob}});return true}
      catch(e){signal.throwIfAborted();if(!allowServer){patch(row.id,{state:'failed',stage:'Local processing failed',error:e instanceof Error?e.message:'Unsupported local model'});return true}}
    }
    if(!row.pending&&!allowServer){patch(row.id,{state:'skipped',stage:'Skipped',error:'Server processing is disabled for this batch'});return true}
    let p=row.pending
    let attemptedReuse=false
    try{
      if(!p){
        if(!batch.current||Date.now()>=batch.current.expiresAt)batch.current=await api.createBatch(operation,signal)
        let upload=row.packageFile??source
        if(model.dependencies.length&&!row.packageFile){
          patch(row.id,{stage:'Bundling related model files',progress:null})
          const blob=await zipFiles([model.asset,...model.dependencies],signal)
          upload=new File([blob],'dependencies.zip',{type:'application/zip'});patch(row.id,{packageFile:upload})
        }
        const reuse=row.sourceSession&&Date.now()+120000<row.sourceSession.expiresAt?row.sourceSession:undefined
        attemptedReuse=!!reuse
        const session=await api.createBatchUpload(batch.current,upload,source.name,target,compression,signal,model.dependencies.length?model.asset.path:undefined,packaged,'conversion',reuse)
        p={session,target,uploaded:session.reused===true}
        patch(row.id,{pending:p,stage:'Uploading',progress:0})
        if(!session.reused)await api.upload(session,upload,signal,progress=>patch(row.id,{progress,stage:'Uploading'}))
        p={...p,uploaded:true};patch(row.id,{pending:p,stage:'Submitting',progress:null})
      }else if(!p.uploaded){
        // A lost upload response may mean the object is already complete. Try
        // authoritative submit before re-uploading; never create a duplicate job.
        try{await api.submit(p.session,signal);p={...p,uploaded:true};patch(row.id,{pending:p})}
        catch{signal.throwIfAborted();await api.cancel(p.session);patch(row.id,{pending:undefined,state:'failed',stage:'Upload interrupted',error:'Retry this file to start a fresh upload'});return true}
      }
      const job=await track(row,p,signal)
      if(job.status==='completed'&&typeof job.outputBytes==='number'&&job.outputBytes>0){
        patch(row.id,{pending:undefined,state:'done',stage:'Completed on server',progress:100,sourceSession:p.session,result:{name,bytes:job.outputBytes,originalBytes:job.originalBytes??source.size,convertedBytes:job.convertedBytes??null,warning:job.warning??null,session:p.session}})
      }else patch(row.id,{pending:undefined,state:'failed',stage:job.status,error:job.error??'Server processing did not complete',progress:null})
      return true
    }catch(e){
      const detail=e instanceof Error?e.message:'Processing failed'
      if(p){
        if(!p.uploaded){try{await api.cancel(p.session);patch(row.id,{pending:undefined,state:'failed',stage:'Upload failed',error:detail,progress:null});return true}catch{/* Keep token when cancellation cannot be confirmed. */}}
        patch(row.id,{pending:p,state:'paused',stage:'Tracking paused',error:detail,progress:null})
        return false
      }
      patch(row.id,{state:'failed',stage:'Failed',error:attemptedReuse?detail+' · Retry to upload the source again.':detail,progress:null,...(attemptedReuse?{sourceSession:undefined}:{})});return true
    }
  }
  async function run(only?:number){
    if(active.current)return
    if(rowsRef.current.some(r=>r.previewPending)){setError('Resume the package preview first.');return}
    const unknown=rowsRef.current.find(r=>r.pending)
    if(unknown&&only!==undefined&&unknown.id!==only){setError('Resume the unfinished server job before starting another file.');return}
    const controller=new AbortController();active.current=controller;stop.current=false;setStopRequested(false);setWorking(true);setError('')
    try{
      const candidates=rowsRef.current.filter(row=>only===undefined?row.include&&row.state!=='done':row.id===only&&row.include&&row.state!=='done')
      // The uncertain job owns the one server slot; resume it first.
      candidates.sort((a,b)=>Number(!!b.pending)-Number(!!a.pending)||a.id-b.id)
      for(const row of candidates){if(stop.current||controller.signal.aborted)break;setMessage('Processing '+row.model.asset.path);if(!await processRow(row,controller.signal))break}
      setMessage(rowsRef.current.some(row=>row.pending)?'Tracking paused. Resume the existing server job before continuing.':stop.current?'Stopped after current file. Completed files remain downloadable.':'Batch pass finished. Download results or retry failed files.')
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Batch processing interrupted')}
    finally{if(active.current===controller)active.current=null;if(alive.current){setWorking(false);setStopRequested(false)}}
  }
  async function previewPackage(row:Row){
    if(active.current||!serverReady||rowsRef.current.some(r=>r.pending||r.previewPending&&r.id!==row.id))return
    const controller=new AbortController();active.current=controller;setWorking(true);setError('')
    const signal=controller.signal
    let session=row.previewPending,uploaded=row.previewUploaded===true
    try{
      if(!session){
        if(!batch.current||Date.now()>=batch.current.expiresAt)batch.current=await api.createBatch(operation,signal)
        let file=row.packageFile
        if(!file){file=new File([await zipFiles([row.model.asset,...row.model.dependencies],signal,setMessage)],'dependencies.zip',{type:'application/zip'});patch(row.id,{packageFile:file})}
        session=await api.createBatchUpload(batch.current,file,row.model.asset.file.name,'GLB','None',signal,row.model.asset.path,false,'preview',row.sourceSession&&Date.now()+120000<row.sourceSession.expiresAt?row.sourceSession:undefined)
        patch(row.id,{previewPending:session,previewUploaded:session.reused===true})
        if(!session.reused)await api.upload(session,file,signal,p=>setMessage('Uploading package for preview · '+p+'%'))
        uploaded=true;patch(row.id,{previewUploaded:true})
      }
      while(Date.now()<session.expiresAt){
        signal.throwIfAborted()
        const job=await api.status(session,signal)
        if(job.status==='awaiting-upload'){await api.submit(session,signal);uploaded=true;patch(row.id,{previewUploaded:true})}
        else if(job.status==='completed'){
          if(!job.outputBytes||job.previewKind!=='GLB')throw new Error('Invalid preview result')
          const blob=await api.fetchPreview(session,job.outputBytes,signal)
          patch(row.id,{previewFile:new File([blob],'package-preview.glb'),sourceSession:session,previewPending:undefined,previewUploaded:undefined})
          setMessage('Package preview ready. Conversion can reuse the uploaded source.');return
        }else if(['failed','expired','cancelled'].includes(job.status)){patch(row.id,{previewPending:undefined,previewUploaded:undefined});throw new Error(job.error??'Package preview '+job.status)}
        setMessage(job.status==='active'?'Generating package preview…':'Package preview waiting for worker…')
        await api.wait(2500,signal)
      }
      patch(row.id,{previewPending:undefined,previewUploaded:undefined});throw new Error('Preview expired')
    }catch(e){
      if(session&&!uploaded){try{await api.cancel(session);patch(row.id,{previewPending:undefined,previewUploaded:undefined})}catch{/* keep token for reconciliation */}}
      setError(e instanceof Error?e.message:'Package preview unavailable')
    }finally{if(active.current===controller)active.current=null;if(alive.current)setWorking(false)}
  }
  function choosePrimary(id:number){
    if(active.current||pending||completed>0)return
    const root=rowsRef.current.find(r=>r.id===id)
    if(!root)return
    const model=root.model.manual?attachFolder(root.model,assetsRef.current):root.model
    replace(rowsRef.current.map(r=>r.id===id?{...r,include:true,model,packageFile:undefined,previewFile:undefined,sourceSession:undefined}:{...r,include:false}));setSelected(id)
  }
  function attach(row:Row){
    if(active.current||pending||row.state==='done')return
    try{const model=attachFolder(row.model,assetsRef.current);patch(row.id,{model,packageFile:undefined,sourceSession:undefined,previewFile:undefined,state:'ready',stage:'Folder assets attached'})}
    catch(e){setError(e instanceof Error?e.message:'Unable to attach folder')}
  }
  async function downloadOne(row:Row){
    if(!row.result)return
    try{const blob=row.result.blob??cachedResults.current.get(row.id);if(blob)trigger(URL.createObjectURL(blob),row.result.name,true);else if(row.result.session){const signed=await api.download(row.result.session);trigger(signed.url,row.result.name)}}
    catch(e){setError(e instanceof Error?e.message:'Download unavailable')}
  }
  async function downloadAll(){
    if(active.current)return
    const controller=new AbortController();active.current=controller;setPacking(true);setError('')
    const disk=resultScratch.current,assets:{path:string;file:Blob}[]=[],failed:string[]=[]
    try{
      for(const row of rowsRef.current){
        const result=row.result;if(!result)continue
        try{
          setMessage('Collecting '+result.name)
          let blob=result.blob??cachedResults.current.get(row.id)
          if(!blob&&result.session){
            const signed=await api.download(result.session)
            const response=await fetch(signed.url,{signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'})
            if(!response.ok||!response.body)throw new Error('Download expired or unavailable')
            blob=await disk.save(response.body,result.name,result.bytes,controller.signal)
            cachedResults.current.set(row.id,blob)
          }
          if(blob)assets.push({path:zipName(row),file:blob})
        }catch{controller.signal.throwIfAborted();failed.push(result.name)}
      }
      if(!assets.length)throw new Error('No downloadable results remain')
      const archive=await zipFiles(assets,controller.signal,setMessage)
      trigger(URL.createObjectURL(archive),compress?'compressed-models.zip':'converted-models.zip',true)
      setMessage(assets.length+' results packaged'+(failed.length?' · '+failed.length+' unavailable':''))
      if(failed.length)setError('ZIP excludes unavailable results: '+failed.join(', '))
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'ZIP packaging failed')}
    finally{if(active.current===controller)active.current=null;if(alive.current)setPacking(false)}
  }
  async function clear(){
    if(active.current)return
    if(pending){setError('Resume the unfinished server job before clearing this batch, or leave the page to let it expire.');return}
    replace([]);batch.current=null;setMessage('');setError('')
    await scratch.current.close();scratch.current=new Scratch()
    await resultScratch.current.close();resultScratch.current=new Scratch();cachedResults.current.clear()
  }
  const chosen=rows.find(row=>row.id===selected),completed=rows.filter(r=>r.state==='done').length
  const included=rows.filter(r=>r.include),includedDone=included.filter(r=>r.state==='done').length
  const changeCommon=(value:ModelFormat)=>{setCommon(value);replace(rowsRef.current.map(row=>row.state==='done'||row.pending?row:{...row,target:value,state:'ready',stage:'Ready',error:undefined}))}
  return <main className="app-shell batch-shell">
    <header className="topbar"><a className="brand" href="/">formshift</a><nav className="tool-nav" aria-label="Model tools"><a href="/" aria-disabled={locked||pending} onClick={e=>{if(locked||pending)e.preventDefault()}}>Convert</a><a href="/compress" aria-disabled={locked||pending} onClick={e=>{if(locked||pending)e.preventDefault()}}>Compress</a><a href="/batch" aria-current={!compress?'page':undefined} aria-disabled={locked||pending} onClick={e=>{if(locked||pending)e.preventDefault()}}>Batch convert</a><a href="/compress/batch" aria-current={compress?'page':undefined} aria-disabled={locked||pending} onClick={e=>{if(locked||pending)e.preventDefault()}}>Batch compress</a></nav><span className="service-indicator"><i/>{serverReady?'Server ready':'Browser mode'}</span><VoxelNav/></header>
    <section className="intro batch-intro"><div className="intro-copy"><div className="eyebrow">MULTIPLE FILES · PRIVATE PROCESSING</div><h1>{compress?'Compress':'Convert'} <span>{singlePackage?'your complete model.':'your models together.'}</span></h1><p>{compress?'Reduce supported models individually, without changing file formats.':'Choose a common output or set the format for each model. Conversion never applies optional compression.'}</p></div></section>
    <section className="batch-upload upload-card" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!locked&&!pending){const files=dropped(e);void scan(()=>files)}}}>
      <input ref={filesInput} type="file" multiple className="visually-hidden" disabled={locked||pending} onChange={pick} aria-label="Select multiple files or ZIP"/>
      <input ref={el=>{folderInput.current=el;if(el)el.setAttribute('webkitdirectory','')}} type="file" multiple className="visually-hidden" disabled={locked||pending} onChange={pick} aria-label="Select folder"/>
      <div className="upload-copy"><strong>{singlePackage?'Drop one model folder or ZIP package here':'Drop models, a folder or ZIP archives here'}</strong><span>Up to 100 models per batch. No fixed individual upload byte cap; ZIP extraction safety limits apply.</span></div>
      <div className="batch-buttons"><button className="job-action" type="button" disabled={locked||pending} onClick={()=>filesInput.current?.click()}>Select files / ZIP</button><button className="job-action" type="button" disabled={locked||pending} onClick={()=>folderInput.current?.click()}>Select folder</button>{rows.length>0&&<button className="job-action" type="button" disabled={locked||pending} onClick={()=>void clear()}>Clear batch</button>}</div>
    </section>
    {message&&<p className="batch-message" role="status">{message}</p>}{error&&<p className="error-message" role="alert">{error}</p>}
    {scanning&&<button className="job-action" type="button" onClick={()=>active.current?.abort()}>Cancel scan</button>}
    {!!rows.length&&<>
      {singlePackage&&<section className="batch-options"><label>Main model<select value={included[0]?.id??''} disabled={locked||pending||completed>0} onChange={e=>choosePrimary(Number(e.target.value))}><option value="" disabled>Select the primary model</option>{rows.map(r=><option key={r.id} value={r.id}>{r.model.asset.path}</option>)}</select></label><p className="format-footnote">Referenced assets follow the main model automatically. Other independent models are excluded.</p></section>}
      <section className="batch-options" aria-label="Batch settings">
        {compress?<label>Compression level<select value={level} disabled={locked||pending||completed>0} onChange={e=>setLevel(e.target.value as CompressionLevel)}>{['Low','Medium','High'].map(v=><option key={v}>{v}</option>)}</select></label>:<label>Common output<select value={common} disabled={locked||pending} onChange={e=>changeCommon(e.target.value as ModelFormat)}>{ACCEPTED_FORMATS.filter(f=>rows.some(row=>row.model.format!==f&&isConversionSupported(row.model.format,f))).map(f=><option key={f}>{f}</option>)}</select></label>}
        <label className="batch-consent"><input type="checkbox" checked={allowServer} disabled={locked||pending} onChange={e=>setAllowServer(e.target.checked)}/> Allow server processing for models that cannot run locally</label>
        <div className="batch-actions"><button className="convert-button" type="button" disabled={locked||!included.length||includedDone===included.length} onClick={()=>void run()}>{pending?'Resume job':singlePackage?(compress?'Compress package':'Convert package'):(compress?'Compress batch':'Convert batch')}</button>{working&&<button className="job-action" type="button" disabled={stopRequested} onClick={()=>{stop.current=true;setStopRequested(true)}}>{stopRequested?'Stopping after current…':'Stop after current'}</button>}<button className="job-action download-action" type="button" disabled={locked||!completed} onClick={()=>void downloadAll()}>{packing?'Preparing ZIP…':'Download completed as ZIP ('+completed+')'}</button>{packing&&<button className="job-action" type="button" onClick={()=>active.current?.abort()}>Cancel ZIP preparation</button>}</div>
      </section>
      <section className="batch-grid">
        <div className="batch-list"><div className="section-heading"><h2>{includedDone} of {included.length} selected models completed</h2></div>
          {rows.map(row=><article key={row.id} className={'batch-row '+(selected===row.id?'batch-selected':'')}>
            <button className="batch-file" type="button" onClick={()=>setSelected(row.id)}><strong title={row.model.asset.path}>{row.model.asset.path}</strong><small>{size(row.model.asset.file.size)} · {row.model.format}{row.model.dependencies.length?' · '+row.model.dependencies.length+' dependencies':''}</small></button>
            {compress?<span>{row.model.format} → {row.model.format}</span>:<label className="batch-target">To <select value={row.target} disabled={locked||pending||row.state==='done'} onChange={e=>patch(row.id,{target:e.target.value as ModelFormat,state:'ready',stage:'Ready',error:undefined})}>
              {!isConversionSupported(row.model.format,row.target)||row.target===row.model.format?<option value={row.target}>{row.target} (incompatible)</option>:null}
              <optgroup label="Recommended">{getOutputGroups(row.model.format).recommended.map(f=><option key={f}>{f}</option>)}</optgroup><optgroup label="Other compatible">{getOutputGroups(row.model.format).other.map(f=><option key={f}>{f}</option>)}</optgroup></select></label>}
            <div className="batch-row-status">{!singlePackage&&<label><input type="checkbox" checked={row.include} disabled={locked||pending||row.state==='done'} onChange={e=>patch(row.id,{include:e.target.checked})}/> Include model</label>}{row.model.warning&&<small>{row.model.warning}</small>}{row.model.dependencies.length>0&&<details className="dependency-list"><summary>{row.model.dependencies.length} supporting files · {size(row.model.dependencies.reduce((n,d)=>n+d.file.size,row.model.asset.file.size))} package</summary>{row.model.dependencies.map(d=><small key={d.path}>{d.path}</small>)}</details>}{supportsPackage(row.model.format)&&<button className="text-button" type="button" disabled={locked||pending||row.state==='done'} onClick={()=>attach(row)}>Attach supporting folder assets</button>}<strong>{row.stage}</strong>{row.progress!==null&&<progress className="job-progress" value={row.progress} max={100}/>}<small>{row.result?size(row.result.bytes)+' · '+((1-row.result.bytes/row.result.originalBytes)*100).toFixed(1)+'% reduction':row.error||reason(row)||(compress&&row.model.dependencies.length?'Lossless package compression; model and asset bytes unchanged.':!compress&&supportsPackageExport(row.target)?'ZIP export includes supported material and texture files.':getOutputWarning(row.target))||''}</small>{row.result?.warning&&<small>{row.result.warning}</small>}</div>
            <div className="batch-row-actions">{row.result?<button className="job-action download-action" type="button" onClick={()=>void downloadOne(row)}>Download</button>:<button className="job-action" type="button" disabled={locked||!row.include||!!reason(row)&&!row.pending||pending&&!row.pending} onClick={()=>void run(row.id)}>{row.pending?'Resume':row.state==='failed'?'Retry':'Process'}</button>}</div>
          </article>)}
        </div>
        <aside className="batch-preview"><div className="preview-heading"><h2>Model preview</h2></div><p className="format-footnote">{chosen?.model.dependencies.length?'Package preview includes the related files in its import. Preview shows static geometry only.':''}</p>{chosen&&chosen.include&&chosen.model.dependencies.length>0&&!chosen.previewFile&&<button className="job-action" type="button" disabled={locked||!serverReady||!!chosen.model.error||!!chosen.model.needsAttachment||rows.some(r=>r.pending||r.previewPending&&r.id!==chosen.id)} onClick={()=>void previewPackage(chosen)}>{chosen.previewPending?'Resume package preview':'Generate package preview'}</button>}<div className="preview-window"><ModelPreview key={String(chosen?.id??-1)+':'+(chosen?.previewFile?'package':'source')} file={chosen?.model.dependencies.length?chosen.previewFile??null:chosen?.model.asset.file??null} result={chosen?.result??null} busy={working||packing} serverReady={serverReady}/></div></aside>
      </section>
      {!working&&!packing&&rows.some(row=>row.result&&printableFormat(row.target)&&!row.result.name.toLowerCase().endsWith('.zip'))&&<PrintNextStep placement={singlePackage?'package_result':'batch_result'}/>}
      <p className="privacy-note">One server job per batch. Individual results are available as soon as they finish. Keep this tab open and finish downloads before clearing the batch; server files and download links expire. ZIP downloads use browser temporary disk where available.</p>
    </>}
    <footer className="page-footer"><VoxelCredit/></footer>
  </main>
}
