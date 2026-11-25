import { useEffect, useRef, useState } from 'react'
import {
  ACCEPTED_FORMATS,
  MAX_UPLOAD_BYTES,
  getFormatFromFilename,
  getSupportedOutputs,
} from './features/converter/compatibility'
import SampleViewport from './features/converter/SampleViewport'
import './App.css'

const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const STL_PREVIEW_LIMIT = 10 * 1024 * 1024

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
  const [compression, setCompression] = useState<(typeof COMPRESSION_LEVELS)[number]>('Medium')
  const [color, setColor] = useState('#8ce5c5')
  const [customColor, setCustomColor] = useState(false)
  const [outputFormat, setOutputFormat] = useState('GLB')
  const [apiOnline, setApiOnline] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE}/health`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => response.ok && (await response.json()).status === 'ok')
      .then((online) => { if (!controller.signal.aborted) setApiOnline(online) })
      .catch(() => { if (!controller.signal.aborted) setApiOnline(false) })
    return () => controller.abort()
  }, [])

  const inputFormat = file ? getFormatFromFilename(file.name) : null
  const outputs = inputFormat ? getSupportedOutputs(inputFormat) : []
  const selectedOutput = outputs.find((format) => format === outputFormat) ?? outputs[0] ?? 'GLB'
  const localPreview = inputFormat === 'STL' && file !== null && file.size <= STL_PREVIEW_LIMIT
  const isColorValid = /^#[0-9a-f]{6}$/i.test(color)

  function selectFile(candidate?: File) {
    if (!candidate) return

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
          <span className="service-indicator"><i /> {apiOnline ? 'API online · worker pending' : 'Local preview'}</span>
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
          <span>Private by design<br /><small>Files stay local in this preview</small></span>
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
            {file && <button className="remove-file" type="button" onClick={() => { setFile(null); setFileError('') }} aria-label="Remove selected file">×</button>}
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
              <div className="format-value"><select aria-label="Output format" value={selectedOutput} disabled={!outputs.length} onChange={(event) => setOutputFormat(event.target.value)}>{(outputs.length ? outputs : ['GLB']).map((format) => <option key={format} value={format}>{format}</option>)}</select><span>Planned export</span></div>
            </div>
          </div>
          <p className="format-footnote">GLB is the initial planned export. Conversion is not available until the worker is connected.</p>

          <div className="preview-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Preview workspace</h2>
            </div>
            <span className="preview-hint"><span className="orbit-icon">◎</span> DRAG TO ORBIT <i /> SCROLL TO ZOOM</span>
          </div>
          <div className="preview-window">
            <div className="preview-grid" aria-hidden="true" />
            <SampleViewport file={localPreview ? file : null} color={customColor && isColorValid ? color : undefined} />
            <div className="preview-label"><span className="live-dot" /> {localPreview ? 'LOCAL STL PREVIEW' : 'INTERACTIVE SAMPLE SCENE'}</div>
            <span className="axis-label axis-x">X</span>
            <span className="axis-label axis-y">Y</span>
            <span className="axis-label axis-z">Z</span>
            <div className="preview-footer"><span>{localPreview ? 'Local STL preview · no upload' : file ? 'Sample only · this file requires server preview or exceeds the 10 MiB preview limit' : 'Sample geometry · select an STL to preview locally'}</span><span>GL VIEWPORT</span></div>
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
            <div className="setting-heading"><span>Compression</span><span>GLB</span></div>
            <p>Reduce file size while keeping your model useful.</p>
            <div className="compression-options" id="compression" role="group" aria-label="Compression level">
              {COMPRESSION_LEVELS.map((level) => (
                <button
                  className={compression === level ? 'compression-option selected' : 'compression-option'}
                  type="button"
                  key={level}
                  aria-pressed={compression === level}
                  onClick={() => setCompression(level)}
                >{level}</button>
              ))}
            </div>
            <div className="compression-detail"><span>Selected</span><b>{compression}</b></div>
          </div>

          <div className="setting-divider" />

          <div className="setting-block color-block">
            <div className="setting-heading"><label htmlFor="color-hex">Model color</label><span>OPTIONAL</span></div>
            <p>Preserve the original materials, or choose a custom export color.</p>
            <label className="color-toggle"><input type="checkbox" checked={customColor} onChange={(event) => setCustomColor(event.target.checked)} /> Use custom color</label>
            <div className="color-control">
              <label className="color-swatch" htmlFor="model-color" style={{ backgroundColor: isColorValid ? color : '#8ce5c5' }}>
                <input id="model-color" type="color" disabled={!customColor} value={isColorValid ? color : '#8ce5c5'} onChange={(event) => setColor(event.target.value)} aria-label="Choose model color" />
              </label>
              <input id="color-hex" className="hex-input" disabled={!customColor} value={color} maxLength={7} onChange={(event) => setColor(event.target.value)} aria-label="Model color HEX value" aria-invalid={customColor && !isColorValid} />
              <span className={!customColor || isColorValid ? 'color-check' : 'color-check invalid'} aria-hidden="true">{!customColor ? '—' : isColorValid ? '✓' : '!'}</span>
            </div>
            <span className="setting-note">{customColor && !isColorValid ? 'Enter a valid six-digit HEX color.' : customColor ? 'Preview color only; exported color support is pending.' : 'Original materials will be preserved when export is implemented.'}</span>
          </div>

          <div className="setting-divider" />

          <div className="setting-block output-block">
            <div className="setting-heading"><span>Output file</span><span>ESTIMATE</span></div>
            <div className="output-summary">
              <div className="output-icon" aria-hidden="true">▧</div>
              <div><b>{file ? `${file.name.replace(/\.[^.]+$/, '')}.${selectedOutput.toLowerCase()}` : `Your model.${selectedOutput.toLowerCase()}`}</b><span>{file ? formatBytes(file.size) + ' before compression' : 'File size appears after upload'}</span></div>
            </div>
            <div className="size-estimate"><span>Potential size reduction</span><b>Calculated after processing</b></div>
          </div>

          <div className="queue-card">
            <div className="queue-top"><span className="queue-dot" /> {apiOnline ? 'API ONLINE · QUEUE PENDING' : 'SERVICE NOT CONNECTED'}</div>
            <p>Queue position and wait time will show here when the conversion API is online.</p>
            <div className="queue-meta"><span>QUEUE <b>—</b></span><span>ETA <b>—</b></span></div>
          </div>

          <button className="convert-button" type="button" disabled>
            <span>{file ? 'Conversion service coming soon' : 'Add a file to continue'}</span>
            <span aria-hidden="true">↗</span>
          </button>
          <p className="privacy-note"><span aria-hidden="true">⌑</span> Files are local for now; temporary storage is planned</p>
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
