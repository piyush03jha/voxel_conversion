import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Edges, OrbitControls } from '@react-three/drei'
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { convertLocally } from './browser-client'
import { getFormatFromFilename } from './compatibility'
import { LOCAL_MAX_BYTES } from './browser-route'

type ModelState = { file: File; scene: Group | null; error?: string }
function dispose(scene:Group){
  scene.traverse(obj=>{
    if(obj instanceof Mesh){
      obj.geometry.dispose()
      for(const material of Array.isArray(obj.material)?obj.material:[obj.material])material.dispose()
    }
  })
}
export default function ThreeScene({ file }: { file: File | null }) {
  const [model,setModel]=useState<ModelState|null>(null)
  useEffect(()=>{
    if(!file)return
    const controller=new AbortController()
    let scene:Group|undefined
    async function load(){
      try{
        const source=file
        if(!source||source.size>LOCAL_MAX_BYTES)throw new Error('Preview size limit')
        const format=getFormatFromFilename(source.name)
        if(!format)throw new Error('Unsupported preview')
        const blob=await convertLocally(source,format,'GLB',controller.signal,true)
        const bytes=await blob.arrayBuffer()
        controller.signal.throwIfAborted()
        // Worker stripped all external resources and bounded geometry before parsing.
        const gltf=await new GLTFLoader().parseAsync(bytes,'')
        scene=gltf.scene
        if(controller.signal.aborted){dispose(scene);scene=undefined;return}
        scene.traverse(obj=>{
          if(obj instanceof Mesh){
            if(!obj.geometry.getAttribute('normal'))obj.geometry.computeVertexNormals()
            for(const mat of Array.isArray(obj.material)?obj.material:[obj.material])mat.dispose()
            obj.material=new MeshStandardMaterial({color:'#aebbb6',roughness:.65})
          }
        })
        const bounds=new Box3().setFromObject(scene)
        const size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3())
        const span=Math.max(size.x,size.y,size.z)
        if(!Number.isFinite(span)||span<=0||!center.toArray().every(Number.isFinite))throw new Error('Invalid bounds')
        const wrapper=new Group()
        wrapper.add(scene)
        scene.position.sub(center)
        wrapper.scale.setScalar(2.8/span)
        scene=wrapper
        setModel({file:source,scene})
      }catch{
        if(scene){dispose(scene);scene=undefined}
        if(!controller.signal.aborted&&file)setModel({file,scene:null,error:'Geometry preview unavailable for this model. Conversion is still available.'})
      }
    }
    void load()
    return()=>{controller.abort();if(scene){dispose(scene);scene=undefined}}
  },[file])
  const current=model?.file===file?model:null
  if(file&&!current)return <div className="scene-loading">Preparing geometry preview…</div>
  if(file&&current?.error)return <div className="scene-loading" role="status">{current.error}</div>
  return <Canvas camera={{position:[3.7,2.4,4.4],fov:40}} dpr={[1,1.5]} frameloop="demand" fallback={<div className="scene-loading">WebGL is unavailable.</div>}>
    <color attach="background" args={['#101b1c']}/>
    <ambientLight intensity={1.7}/>
    <directionalLight position={[4,5,6]} intensity={3} color="#ddfff4"/>
    <directionalLight position={[-4,-2,-3]} intensity={2} color="#79a9ff"/>
    {file&&current?.scene?<primitive object={current.scene} dispose={null}/>:<mesh><icosahedronGeometry args={[1.45,1]}/><meshStandardMaterial color="#8ce5c5" roughness={.28} metalness={.55} flatShading/><Edges color="#d5fff1" threshold={12}/></mesh>}
    <gridHelper args={[9,18,'#2b4947','#1d3333']} position={[0,-1.7,0]}/>
    <OrbitControls enablePan enableZoom minDistance={2.5} maxDistance={8}/>
  </Canvas>
}
