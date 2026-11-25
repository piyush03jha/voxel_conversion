import { lazy, Suspense, useEffect, useRef, useState } from 'react'

const ThreeScene = lazy(() => import('./ThreeScene'))

export default function SampleViewport() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [shouldLoadScene, setShouldLoadScene] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoadScene(true)
        observer.disconnect()
      }
    }, { rootMargin: '180px' })

    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={viewportRef} className="preview-canvas" aria-label="Interactive sample 3D scene">
      {shouldLoadScene ? (
        <Suspense fallback={<div className="scene-loading">Loading 3D scene…</div>}>
          <ThreeScene />
        </Suspense>
      ) : (
        <div className="scene-loading">3D scene loads when you reach the preview</div>
      )}
    </div>
  )
}
