import { useEffect, useRef, useState } from 'react'
import {
  ACCEPTED_FORMATS,
  MAX_UPLOAD_BYTES,
  getFormatFromFilename,
  getSupportedOutputs,
  getCompressionLevels,
  getOutputWarning,
} from './features/converter/compatibility'
import { browserRoute } from './features/converter/browser-route'
import { health } from './features/converter/conversion-client'
import { useConversion } from './features/converter/use-conversion'
import ModelPreview from './features/converter/ModelPreview'
import './App.css'

const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [compression, setCompression] = useState<(typeof COMPRESSION_LEVELS)[number]>('None')
  const [outputFormat, setOutputFormat] = useState('GLB')
  const [apiOnline, setApiOnline] = useState(false)
  const [serverReady, setServerReady] = useState(false)
  const { state: job, start, reset, cancelCurrent, downloadResult, downloading, downloadError } = useConversion()

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
  const outputs = inputFormat ? getSupportedOutputs(inputFormat) : []
  const selectedOutput = outputs.find((format) => format === outputFormat) ?? outputs[0] ?? 'GLB'
  const compressionLevels = getCompressionLevels(selectedOutput)
  const outputWarning = getOutputWarning(selectedOutput)

  const local = !!file && !!inputFormat && browserRoute(inputFormat, selectedOutput, file.size, compression)
  const route = local ? 'browser' : 'server'
  const ready = !!file && !job.busy && (local || serverReady)
  const reduction = job.result ? (1 - job.result.bytes / job.result.originalBytes) * 100 : null
  function begin(forceServer = false) {
    if (!file || !inputFormat || job.busy || (forceServer ? !serverReady : !ready)) return
    void start(file, inputFormat, selectedOutput, compression, forceServer ? 'server' : route)
  }

  function selectFile(candidate?: File) {
    if (!candidate || job.busy) return
    reset()

    if (candidate.size === 0) {
      setFile(null)
      setFileError('This file is empty. Choose a valid model.')
      return
    }

    if (candidate.size > MAX_UPLOAD_BYTES) {
      setFile(null)
      setFileError('That file is over the 200 MB upload limit.')
      return
    }

    if (!getFormatFromFilename(candidate.name)) {
      setFile(null)
      setFileError('This file type is not supported. Choose one of the listed formats.')
      return
    }

    setFile(candidate)
    setOutputFormat(getSupportedOutputs(getFormatFromFilename(candidate.name)!)[0] ?? 'GLB')
    setCompression('None')
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
          <h1>Make your models<br /><span>work everywhere.</span></h1>
          <p>Convert and compress 3D files in one clean workspace. Drop in a model to get started.</p>
        </div>
        <div className="intro-note">
          <span className="note-icon" aria-hidden="true">✳</span>
          <span>Private by design<br /><small>Local processing when possible</small></span>
        </div>
      </section>

      <section className="workspace" aria-label="3D file converter">
        <div className="workspace-main">
          <div className="section-heading">
            <div>
              <span className="step-number">01</span>
              <h2>Bring in a model</h2>
            </div>
            <span className="section-caption">MAX FILE SIZE <b>200 MB</b></span>
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
              disabled={job.busy}
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
            {file && <button className="remove-file" type="button" disabled={job.busy} onClick={() => { setFile(null); setFileError(''); reset() }} aria-label="Remove selected file">×</button>}
          </div>
          {fileError && <p className="error-message" role="alert">{fileError}</p>}

          <div className="format-row">
            <div className="format-select">
              <span className="field-label">FROM</span>
              <div className="format-value">{inputFormat ?? '—'} <span>{inputFormat ? 'Input format detected' : 'Waiting for file'}</span></div>
            </div>
            <span className="format-arrow" aria-hidden="true">→</span>
            <div className="format-select output-format">
              <span className="field-label">TO</span>
              <div className="format-value"><select aria-label="Output format" value={selectedOutput} disabled={!outputs.length || job.busy} onChange={(event) => { setOutputFormat(event.target.value); setCompression('None'); reset() }}>{(outputs.length ? outputs : ['GLB']).map((format) => <option key={format} value={format}>{format}</option>)}</select><span>Selected export</span></div>
            </div>
          </div>
          <p className="format-footnote">Choose a compatible output. {outputWarning ?? 'Format conversion may change materials or geometry.'}</p>

          <div className="preview-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Preview workspace</h2>
            </div>
            <span className="preview-hint"><span className="orbit-icon">◎</span> DRAG TO ORBIT <i /> SCROLL TO ZOOM</span>
          </div>
          <div className="preview-window">
            <div className="preview-grid" aria-hidden="true" />
            <ModelPreview key={file ? file.name + ':' + file.size + ':' + file.lastModified : 'empty'} file={file} result={job.result} busy={job.busy} />
          </div>
        </div>

        <aside className="settings-panel">
          <div className="settings-title">
            <div>
              <span className="step-number">03</span>
              <h2>Fine-tune</h2>
            </div>
            <span className="settings-badge">OPTIONS</span>
          </div>

          <div className="setting-block">
            <div className="setting-heading"><span>Compression</span><span>{selectedOutput}</span></div>
            <p>{compressionLevels.length === 1 ? 'Compression is unavailable for this output.' : selectedOutput === 'GLB' ? 'GLB optimization may change texture quality or simplify static geometry.' : selectedOutput === '3MF' ? 'ZIP compression changes package size without deliberately reducing geometry.' : 'Mesh compression may reduce static geometry. The original export is retained if the result is not smaller.'}</p>
            <div className="compression-options" id="compression" role="group" aria-label="Compression level">
              {COMPRESSION_LEVELS.map((level) => (
                <button
                  className={compression === level ? 'compression-option selected' : 'compression-option'}
                  type="button"
                  key={level}
                  aria-pressed={compression === level}
                  disabled={job.busy || !compressionLevels.includes(level)}
                  onClick={() => { setCompression(level); reset() }}
                >{level}</button>
              ))}
            </div>
            <div className="compression-detail"><span>Selected</span><b>{compression}</b></div>
          </div>

          <div className="setting-divider" />

          <div className="setting-block color-block">
            <div className="setting-heading"><span>Model color</span><span>PAUSED</span></div>
            <p>Custom color is postponed. No color override will be applied.</p>
          </div>

          <div className="setting-divider" />

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
            <p>{job.busy || job.result || job.error ? job.stage : !file ? 'The converter selects the processing engine automatically.' : local ? 'Eligible for local conversion. Your file will not be uploaded; unsupported content requires explicit server fallback.' : serverReady ? 'This file or setting requires the server. Convert will upload to private temporary storage.' : 'This conversion requires the server, which is currently unavailable.'}</p>
            {job.progress !== null && <progress className="job-progress" value={job.progress} max={100} aria-label="Conversion stage progress" />}
            <div className="queue-meta"><span>QUEUE <b>{job.position ?? '—'}</b></span><span>EST. WAIT <b>{job.eta === null ? '—' : job.eta < 60 ? job.eta + ' sec' : Math.ceil(job.eta / 60) + ' min'}</b></span></div>
            {job.result?.convertedBytes != null && job.result.convertedBytes > 0 && job.route === 'server' && <p>Before compression: {formatBytes(job.result.convertedBytes)} · reduction: {((1 - job.result.bytes / job.result.convertedBytes) * 100).toFixed(1)}%</p>}
            {job.result?.warning && <p className="job-warning">{job.result.warning}</p>}
            {job.error && <p className="error-message" role="alert">{job.error}</p>}
          </div>

          <button className="convert-button" type="button" disabled={!ready || downloading} onClick={() => begin()}>
            <span>{job.busy ? job.stage : !file ? 'Add a file to continue' : local ? 'Convert in browser' : 'Convert on server'}</span>
            <span aria-hidden="true">↗</span>
          </button>
          {job.busy && job.stage !== 'Converting on server' && <button className="job-action" type="button" onClick={() => void cancelCurrent()}>Cancel</button>}
          {job.fallback && !job.busy && <button className="job-action" type="button" disabled={!serverReady} onClick={() => begin(true)}>Upload and convert on server instead</button>}
          {job.busy && job.stage === 'Converting on server' && <p className="privacy-note">Active server conversions cannot be cancelled yet.</p>}
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

export default App
