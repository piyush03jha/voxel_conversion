import { useEffect, useRef, useState } from 'react'
import {
  ACCEPTED_FORMATS,
  getFormatFromFilename,
  getOutputGroups,
  FORMAT_USE,
  getCompressionLevels,
  getOutputWarning,
} from './features/converter/compatibility'
import { browserRoute } from './features/converter/browser-route'
import { health } from './features/converter/conversion-client'
import { useConversion } from './features/converter/use-conversion'
import BatchWorkspace from './features/batch/BatchWorkspace'
import ModelPreview from './features/converter/ModelPreview'
import './App.css'

const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if(bytes >= 1024 ** 3)return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function SingleWorkspace() {
  const compressPage = window.location.pathname.replace(/\/$/, '') === '/compress'
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [compression, setCompression] = useState<(typeof COMPRESSION_LEVELS)[number]>('None')
  const [outputFormat, setOutputFormat] = useState('GLB')
  const [apiOnline, setApiOnline] = useState(false)
  const [serverReady, setServerReady] = useState(false)
  const { state: job, start, reset, cancelCurrent, downloadResult, downloading, downloadError, resumeTracking, pauseTracking } = useConversion()

  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    async function check() {
      if (pending || controller.signal.aborted) return
      pending = true
      try {
        const data = await health(controller.signal)
        if (!controller.signal.aborted) { setApiOnline(data.status === 'ok'); setServerReady(data.conversionAvailable === true) }
      } catch {
        if (!controller.signal.aborted) { setApiOnline(false); setServerReady(false) }
      } finally { pending = false }
    }
    void check()
    const timer = setInterval(() => { void check() }, 10000)
    return () => { clearInterval(timer); controller.abort() }
  }, [])

  const inputFormat = file ? getFormatFromFilename(file.name) : null
  const groups = inputFormat ? getOutputGroups(inputFormat) : { recommended: [], other: [] }
  const outputs = [...groups.recommended, ...groups.other]
  const selectedOutput = compressPage ? inputFormat ?? 'GLB' : outputs.find((format) => format === outputFormat) ?? outputs[0] ?? 'GLB'
  const locked = job.busy || job.canResume || downloading
  const selectedCompression = compressPage ? compression : 'None'
  const compressible = !compressPage || (!!inputFormat && getCompressionLevels(inputFormat).length > 1 && compression !== 'None')
  const compressionLevels = getCompressionLevels(selectedOutput)
  const outputWarning = getOutputWarning(selectedOutput)

  const local = !!file && !!inputFormat && browserRoute(inputFormat, selectedOutput, file.size, selectedCompression)
  const route = local ? 'browser' : 'server'
  const ready = !!file && !locked && compressible && (local || serverReady)
  const reduction = job.result ? (1 - job.result.bytes / job.result.originalBytes) * 100 : null
  function begin(forceServer = false) {
    if (!file || !inputFormat || locked || !compressible || (forceServer ? !serverReady : !ready)) return
    void start(file, inputFormat, selectedOutput, selectedCompression, forceServer ? 'server' : route)
  }

  function selectFile(candidate?: File) {
    if (!candidate || job.busy || job.canResume || downloading) return
    reset()

    if (candidate.size === 0) {
      setFile(null)
      setFileError('This file is empty. Choose a valid model.')
      return
    }

    if (!getFormatFromFilename(candidate.name)) {
      setFile(null)
      setFileError('This file type is not supported. Choose one of the listed formats.')
      return
    }

    setFile(candidate)
    setOutputFormat(getOutputGroups(getFormatFromFilename(candidate.name)!).recommended[0] ?? 'GLB')
    setCompression(compressPage ? 'Medium' : 'None')
    setFileError('')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Formshift home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>formshift</span>
        </a>
        <nav className="tool-nav" aria-label="Model tools">
          <a href="/" aria-current={!compressPage ? 'page' : undefined} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>Convert</a>
          <a href="/compress" aria-current={compressPage ? 'page' : undefined} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>Compress</a>
          <a href={compressPage?'/compress/batch':'/batch'} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>Batch {compressPage?'compress':'convert'}</a>
        </nav>
        <div className="topbar-right">
          <span className="service-indicator"><i /> {serverReady ? 'Server ready' : apiOnline ? 'Server conversion offline' : 'Browser mode'}</span>
          <a className="github-link" href="https://github.com/piyush03jha/voxel_conversion" target="_blank" rel="noreferrer">
            About the project <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <section className="intro">
        <div className="intro-copy">
          <div className="eyebrow"><span>01</span> THE 3D FILE WORKSHOP</div>
          <h1>{compressPage ? <>Make your models<br /><span>lighter.</span></> : <>Make your models<br /><span>work everywhere.</span></>}</h1>
          <p>{compressPage ? 'Reduce model size without changing its file format. Choose a compression level.' : 'Convert your 3D model into a compatible format, with no optional compression applied.'}</p>
        </div>
        <div className="intro-note">
          <span className="note-icon" aria-hidden="true">✳</span>
          <span>Private by design<br /><small>Local processing when possible</small></span>
        </div>
      </section>

      <section className="workspace" aria-label={compressPage ? "3D file compressor" : "3D file converter"}>
        <div className="workspace-main">
          <div className="section-heading">
            <div>
              <span className="step-number">01</span>
              <h2>Bring in a model</h2>
            </div>
            <span className="section-caption"><b>No fixed upload size limit</b></span>
          </div>

          <div className={`upload-card ${isDragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setIsDragging(false)
              selectFile(event.dataTransfer.files[0])
            }}>
            <input
              ref={fileInputRef}
              className="visually-hidden"
              type="file"
              disabled={job.busy || job.canResume || downloading}
              accept={ACCEPTED_FORMATS.map((format) => `.${format.toLowerCase()}`).join(',')}
              onChange={(event) => {
                selectFile(event.currentTarget.files?.[0])
                event.currentTarget.value = ''
              }}
              aria-label="Choose a 3D model file"
            />
            <div className="upload-symbol" aria-hidden="true">
              {file ? <span className="file-glyph">◇</span> : <span className="upload-arrow">↑</span>}
            </div>
            <div className="upload-copy">
              {file ? (
                <>
                  <strong className="file-name">{file.name}</strong>
                  <span>{formatBytes(file.size)} <i /> {inputFormat} model</span>
                </>
              ) : (
                <>
                  <strong>Drop your 3D file here</strong>
                  <span>or <button className="text-button" type="button" onClick={() => fileInputRef.current?.click()}>browse files</button> from your device</span>
                </>
              )}
            </div>
            {file && <button className="remove-file" type="button" disabled={job.busy || job.canResume || downloading} onClick={() => { setFile(null); setFileError(''); reset() }} aria-label="Remove selected file">×</button>}
          </div>
          {fileError && <p className="error-message" role="alert">{fileError}</p>}
          <p className="format-footnote" style={{marginTop:12,marginBottom:16}}>Have a model folder with textures or materials? <a className="tool-link" href={compressPage?'/compress/package':'/package'} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>Open model package</a>. For independent models, use <a className="tool-link" href={compressPage?'/compress/batch':'/batch'} aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>batch {compressPage?'compression':'conversion'}</a>.</p>

          <div className="preview-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Preview workspace</h2>
            </div>
            <span className="preview-hint"><span className="orbit-icon">◎</span> DRAG TO ORBIT <i /> SCROLL TO ZOOM</span>
          </div>
          <div className="preview-window">
            <div className="preview-grid" aria-hidden="true" />
            <ModelPreview key={file ? file.name + ':' + file.size + ':' + file.lastModified : 'empty'} file={file} result={job.result} busy={job.busy} serverReady={serverReady} />
          </div>
        </div>

        <aside className="settings-panel">
          <div className="settings-title">
            <div>
              <span className="step-number">03</span>
              <h2>{compressPage ? 'Compression' : 'Conversion'}</h2>
            </div>
            <span className="settings-badge">OPTIONS</span>
          </div>

          {compressPage ? <div className="same-format-note"><span className="field-label">FILE FORMAT</span><strong>{inputFormat ?? '—'} → {inputFormat ?? '—'}</strong><p>{inputFormat && getCompressionLevels(inputFormat).length===1 ? 'Compression is unavailable for this format. Convert to GLB or another supported compression format first.' : 'Compression keeps the selected file format.'}</p></div> : <>
            <div className="format-row">
              <div className="format-select"><span className="field-label">FROM</span><div className="format-value">{inputFormat ?? '—'} <span>Detected format</span></div></div>
              <span className="format-arrow" aria-hidden="true">→</span>
              <div className="format-select output-format"><span className="field-label">TO</span><div className="format-value"><select aria-label="Output format" value={selectedOutput} disabled={!outputs.length || locked} onChange={event=>{setOutputFormat(event.target.value);reset()}}>
                {!outputs.length && <option value="GLB">Select a file</option>}
                <optgroup label="Recommended formats">{groups.recommended.map(format=><option key={format} value={format}>{format} — {FORMAT_USE[format]}</option>)}</optgroup>
                <optgroup label="Other compatible formats">{groups.other.map(format=><option key={format} value={format}>{format}</option>)}</optgroup>
              </select><span>Selected export</span></div></div>
            </div>
            {inputFormat && <div className="recommended-formats">
              <span className="field-label">RECOMMENDED FOR {inputFormat}</span>
              <div className="format-choices">{groups.recommended.map(format=><button type="button" key={format} disabled={locked} aria-pressed={selectedOutput===format} onClick={()=>{setOutputFormat(format);reset()}}><strong>{format}</strong><small>{FORMAT_USE[format]}</small></button>)}</div>
              <details open={groups.other.includes(selectedOutput)}><summary>Other compatible formats ({groups.other.length})</summary><div className="format-choices">{groups.other.map(format=><button type="button" key={format} disabled={locked} aria-pressed={selectedOutput===format} onClick={()=>{setOutputFormat(format);reset()}}><strong>{format}</strong><small>{FORMAT_USE[format]}</small></button>)}</div></details>
            </div>}
            <p className="format-footnote">{outputWarning ?? 'Format conversion may change materials or geometry.'}</p>
          </>}

          {compressPage ? <>
          <div className="setting-block">
            <div className="setting-heading"><span>Compression</span><span>{selectedOutput}</span></div>
            <p>{compressionLevels.length === 1 ? 'Compression is unavailable for this input.' : selectedOutput === 'GLB' ? 'GLB optimization may change texture quality or simplify static geometry.' : selectedOutput === '3MF' ? 'Lossless ZIP recompression preserves the original 3MF package contents.' : 'Mesh compression may reduce static geometry. The original file is retained if the result is not smaller.'}</p>
            <div className="compression-options" id="compression" role="group" aria-label="Compression level">
              {COMPRESSION_LEVELS.filter(level => level !== 'None').map((level) => (
                <button
                  className={compression === level ? 'compression-option selected' : 'compression-option'}
                  type="button"
                  key={level}
                  aria-pressed={compression === level}
                  disabled={!inputFormat || locked || !compressionLevels.includes(level)}
                  onClick={() => { setCompression(level); reset() }}
                >{level}</button>
              ))}
            </div>
            <div className="compression-detail"><span>Selected</span><b>{compression}</b></div>
          </div>

          <div className="setting-divider" />

          </> : <div className="setting-block"><div className="setting-heading"><span>Conversion only</span><span>NO COMPRESSION</span></div><p>Need a smaller file without changing its format? <a className="tool-link" href="/compress" aria-disabled={locked} onClick={event=>{if(locked)event.preventDefault()}}>Open compression</a>.</p></div>}

          <div className="setting-block output-block">
            <div className="setting-heading"><span>Output file</span><span>{job.result ? 'READY' : 'ESTIMATE'}</span></div>
            <div className="output-summary">
              <div className="output-icon" aria-hidden="true">▧</div>
              <div><b>{file ? `${file.name.replace(/\.[^.]+$/, '')}.${selectedOutput.toLowerCase()}` : `Your model.${selectedOutput.toLowerCase()}`}</b><span>{job.result ? formatBytes(job.result.bytes) + ' processed · ' + formatBytes(job.result.originalBytes) + ' original' : file ? formatBytes(file.size) + ' before processing' : 'File size appears after selection'}</span></div>
            </div>
            <div className="size-estimate"><span>Overall size change</span><b>{reduction === null ? 'Calculated after processing' : reduction >= 0 ? reduction.toFixed(1) + '% smaller' : (-reduction).toFixed(1) + '% larger'}</b></div>
          </div>

          <div className="queue-card" aria-live="polite">
            <div className="queue-top"><span className="queue-dot" /> {job.route ? job.route === 'browser' ? 'BROWSER PROCESSING' : 'SERVER PROCESSING' : !file ? 'SELECT A FILE' : local ? 'BROWSER FIRST' : 'SERVER REQUIRED'}</div>
            <p>{job.busy || job.result || job.error || job.canResume ? job.stage : !file ? 'The converter selects the processing engine automatically.' : local ? 'Eligible for local conversion. Your file will not be uploaded; unsupported content requires explicit server fallback.' : serverReady ? 'This file or setting requires the server. Convert will upload to private temporary storage.' : 'This conversion requires the server, which is currently unavailable.'}</p>
            {job.progress !== null && <progress className="job-progress" value={job.progress} max={100} aria-label="Conversion stage progress" />}
            <div className="queue-meta"><span>QUEUE <b>{job.position ?? '—'}</b></span><span>EST. WAIT <b>{job.eta === null ? '—' : job.eta < 60 ? job.eta + ' sec' : Math.ceil(job.eta / 60) + ' min'}</b></span></div>
            {compressPage && job.result?.convertedBytes != null && job.result.convertedBytes > 0 && job.route === 'server' && <p>Before compression: {formatBytes(job.result.convertedBytes)} · reduction: {((1 - job.result.bytes / job.result.convertedBytes) * 100).toFixed(1)}%</p>}
            {job.result?.warning && <p className="job-warning">{job.result.warning}</p>}
            {job.error && <p className="error-message" role="alert">{job.error}</p>}
          </div>

          <button className="convert-button" type="button" disabled={!ready || downloading} onClick={() => begin()}>
            <span>{job.busy || job.canResume ? job.stage : !file ? 'Add a file to continue' : compressPage ? 'Compress model' : local ? 'Convert in browser' : 'Convert on server'}</span>
            <span aria-hidden="true">↗</span>
          </button>
          {job.busy && job.serverStatus !== 'active' && <button className="job-action" type="button" onClick={() => void cancelCurrent()}>Cancel</button>}
          {job.busy && job.route === 'server' && (job.serverStatus !== null || job.stage === 'Reconnecting to server' || job.stage === 'Submitting job') && <button className="job-action" type="button" onClick={pauseTracking}>Pause status tracking (job may continue)</button>}
          {job.canResume && <><button className="job-action" type="button" onClick={() => void resumeTracking()}>Resume tracking</button><button className="job-action" type="button" onClick={reset}>Forget job (may continue on server)</button></>}
          {job.fallback && !job.busy && <button className="job-action" type="button" disabled={!serverReady} onClick={() => begin(true)}>Upload and convert on server instead</button>}
          {job.busy && job.serverStatus === 'active' && <p className="privacy-note">Active server conversions cannot be cancelled yet.</p>}
          {job.result && <button className="job-action download-action" type="button" disabled={downloading} onClick={() => void downloadResult()}>{downloading ? 'Preparing download…' : 'Download ' + selectedOutput}</button>}
          {downloadError && <p className="error-message" role="alert">{downloadError}</p>}
          <p className="privacy-note"><span aria-hidden="true">⌑</span> {job.route === 'browser' || (!job.route && local) ? 'Local conversion: no model upload' : 'Server files are temporary; downloads expire'}</p>
        </aside>
      </section>

      <footer className="page-footer">
        <span>FORM SHIFT <span className="footer-dot">·</span> 3D FILE WORKSHOP</span>
        <span>SUPPORTED INPUTS <b>{ACCEPTED_FORMATS.join('  ·  ')}</b></span>
      </footer>
    </main>
  )
}

export default function App(){
  const path=window.location.pathname.replace(/\/$/,'')
  if(['/batch','/compress/batch','/package','/compress/package'].includes(path))return <BatchWorkspace compress={path.startsWith('/compress')} singlePackage={path.endsWith('/package')}/>
  return <SingleWorkspace/>
}
