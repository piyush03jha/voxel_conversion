import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'

function SampleModel() {
  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight position={[4, 5, 6]} intensity={3} color="#ddfff4" />
      <directionalLight position={[-4, -2, -3]} intensity={2} color="#79a9ff" />
      <mesh>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshStandardMaterial
          color="#8ce5c5"
          roughness={0.28}
          metalness={0.55}
          flatShading
        />
        <Edges color="#d5fff1" threshold={12} />
      </mesh>
      <gridHelper args={[9, 18, '#2b4947', '#1d3333']} position={[0, -1.7, 0]} />
      <OrbitControls enablePan enableZoom minDistance={2.5} maxDistance={8} />
    </>
  )
}

export default function ThreeScene() {
  return (
    <Canvas camera={{ position: [3.7, 2.4, 4.4], fov: 40 }} dpr={[1, 1.5]}>
      <color attach="background" args={['#101b1c']} />
      <SampleModel />
    </Canvas>
  )
}
