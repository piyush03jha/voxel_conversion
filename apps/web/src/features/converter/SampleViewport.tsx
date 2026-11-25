import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const ThreeScene = lazy(() => import('./ThreeScene'))

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <div className="scene-loading" role="status">3D preview unavailable. File selection remains available.</div>
      : this.props.children
  }
}

export default function SampleViewport({ file }: { file: File | null }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [shouldLoadScene, setShouldLoadScene] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (typeof IntersectionObserver === 'undefined') { setShouldLoadScene(true); return }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShouldLoadScene(true); observer.disconnect() }
    }, { rootMargin: '180px' })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={viewportRef} className="preview-canvas" aria-label={file ? 'Local geometry preview' : 'Interactive sample 3D scene'}>
      {shouldLoadScene ? (
        <PreviewBoundary key={file ? file.name + file.size + file.lastModified : 'sample'}>
          <Suspense fallback={<div className="scene-loading">Loading 3D scene…</div>}>
            <ThreeScene file={file} />
          </Suspense>
        </PreviewBoundary>
      ) : <div className="scene-loading">3D scene loads when you reach the preview</div>}
    </div>
  )
}
