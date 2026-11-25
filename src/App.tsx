import { useRef, useState } from 'react'
import {
  ACCEPTED_FORMATS,
  MAX_UPLOAD_BYTES,
  getFormatFromFilename,
  isConversionSupported,
} from './features/converter/compatibility'
import SampleViewport from './features/converter/SampleViewport'
import './App.css'

const COMPRESSION_LEVELS = ['None', 'Low', 'Medium', 'High'] as const
const CONVERSION_SERVICE_CONNECTED = false

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

  const inputFormat = file ? getFormatFromFilename(file.name) : null
  const canConvert = inputFormat !== null && isConversionSupported(inputFormat, 'GLB')
  const isColorValid = /^#[0-9a-f]{6}$/i.test(color)

  function selectFile(candidate?: File) {
    if (!candidate) return

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
          <span className="service-indicator"><i /> Local preview</span>
          <a className="github-link" href="https://github.com/piyush03jha/ADVFX" target="_blank" rel="noreferrer">
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
          <span>Private by design<br /><small>Files are temporary by default</small></span>
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
            {file && <button className="remove-file" type="button" onClick={() => setFile(null)} aria-label="Remove selected file">×</button>}
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
              <div className="format-value">GLB <span>Only currently enabled export</span></div>
            </div>
          </div>
          <p className="format-footnote">Only technically supported formats are enabled. More export formats will be added as they are verified.</p>

          <div className="preview-heading">
            <div>
              <span className="step-number">02</span>
              <h2>Preview workspace</h2>
            </div>
            <span className="preview-hint"><span className="orbit-icon">◎</span> DRAG TO ORBIT <i /> SCROLL TO ZOOM</span>
          </div>
          <div className="preview-window">
            <div className="preview-grid" aria-hidden="true" />
            <SampleViewport />
            <div className="preview-label"><span className="live-dot" /> INTERACTIVE SAMPLE SCENE</div>
            <span className="axis-label axis-x">X</span>
            <span className="axis-label axis-y">Y</span>
            <span className="axis-label axis-z">Z</span>
            <div className="preview-footer"><span>Sample geometry · actual model preview connects with the conversion API</span><span>GL VIEWPORT</span></div>
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
            <div className="setting-heading"><label htmlFor="compression">Compression</label><span>GLB</span></div>
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
            <p>Apply a single color to the exported model.</p>
            <div className="color-control">
              <label className="color-swatch" htmlFor="model-color" style={{ backgroundColor: isColorValid ? color : '#8ce5c5' }}>
                <input id="model-color" type="color" value={isColorValid ? color : '#8ce5c5'} onChange={(event) => setColor(event.target.value)} aria-label="Choose model color" />
              </label>
              <input id="color-hex" className="hex-input" value={color} maxLength={7} onChange={(event) => setColor(event.target.value)} aria-label="Model color HEX value" aria-invalid={!isColorValid} />
              <span className={isColorValid ? 'color-check' : 'color-check invalid'} aria-hidden="true">{isColorValid ? '✓' : '!'}</span>
            </div>
            <span className="setting-note">Color is a local setting; export support is not connected yet.</span>
          </div>

          <div className="setting-divider" />

          <div className="setting-block output-block">
            <div className="setting-heading"><span>Output file</span><span>ESTIMATE</span></div>
            <div className="output-summary">
              <div className="output-icon" aria-hidden="true">▧</div>
              <div><b>{file ? `${file.name.replace(/\.[^.]+$/, '')}.glb` : 'Your model.glb'}</b><span>{file ? formatBytes(file.size) + ' before compression' : 'File size appears after upload'}</span></div>
            </div>
            <div className="size-estimate"><span>Potential size reduction</span><b>Calculated after processing</b></div>
          </div>

          <div className="queue-card">
            <div className="queue-top"><span className="queue-dot" /> SERVICE NOT CONNECTED</div>
            <p>Queue position and wait time will show here when the conversion API is online.</p>
            <div className="queue-meta"><span>QUEUE <b>—</b></span><span>ETA <b>—</b></span></div>
          </div>

          <button className="convert-button" type="button" disabled={!CONVERSION_SERVICE_CONNECTED || !canConvert}>
            <span>{file ? 'Conversion service coming soon' : 'Add a file to continue'}</span>
            <span aria-hidden="true">↗</span>
          </button>
          <p className="privacy-note"><span aria-hidden="true">⌑</span> Files will be temporary and automatically deleted</p>
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
