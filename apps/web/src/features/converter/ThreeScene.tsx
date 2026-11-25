import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { Vector3 } from 'three'
import type { BufferGeometry } from 'three'

type ModelState = { file: File; geometry: BufferGeometry | null; error?: string }

export default function ThreeScene({ file, color }: { file: File | null; color?: string }) {
  const [model, setModel] = useState<ModelState | null>(null)
  useEffect(() => {
    if (!file) return
    let cancelled = false
    let geometry: BufferGeometry | undefined
    async function load() {
      try {
        if (!file || file.size === 0 || file.size > 10 * 1024 * 1024) throw new Error('Preview size limit exceeded')
        const bytes = await file.arrayBuffer()
        if (cancelled) return
        geometry = new STLLoader().parse(bytes)
        const positions = geometry.getAttribute('position')
        if (!positions || positions.count < 3) throw new Error('No mesh geometry')
        geometry.computeBoundingBox()
        const size = geometry.boundingBox?.getSize(new Vector3())
        const span = size ? Math.max(size.x, size.y, size.z) : 0
        if (!Number.isFinite(span) || span <= 0) throw new Error('Invalid geometry')
        geometry.center()
        geometry.scale(2.8 / span, 2.8 / span, 2.8 / span)
        setModel({ file, geometry })
      } catch {
        geometry?.dispose()
        geometry = undefined
        if (!cancelled && file) setModel({ file, geometry: null, error: 'Unable to preview this STL. Check that it contains valid mesh geometry.' })
      }
    }
    void load()
    return () => { cancelled = true; geometry?.dispose() }
  }, [file])

  const current = model?.file === file ? model : null
  if (file && !current) return <div className="scene-loading">Reading STL…</div>
  if (file && current?.error) return <div className="scene-loading" role="status">{current.error}</div>
  return (
    <Canvas camera={{ position: [3.7, 2.4, 4.4], fov: 40 }} dpr={[1, 1.5]} frameloop="demand"
      fallback={<div className="scene-loading">WebGL is unavailable on this device.</div>}>
      <color attach="background" args={['#101b1c']} />
      <ambientLight intensity={1.7} />
      <directionalLight position={[4, 5, 6]} intensity={3} color="#ddfff4" />
      <directionalLight position={[-4, -2, -3]} intensity={2} color="#79a9ff" />
      {file && current?.geometry ? (
        <mesh geometry={current.geometry} rotation={[-Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color={color ?? '#aebbb6'} roughness={0.65} />
        </mesh>
      ) : (
        <mesh>
          <icosahedronGeometry args={[1.45, 1]} />
          <meshStandardMaterial color={color ?? '#8ce5c5'} roughness={0.28} metalness={0.55} flatShading />
          <Edges color="#d5fff1" threshold={12} />
        </mesh>
      )}
      <gridHelper args={[9, 18, '#2b4947', '#1d3333']} position={[0, -1.7, 0]} />
      <OrbitControls enablePan enableZoom minDistance={2.5} maxDistance={8} />
    </Canvas>
  )
}
