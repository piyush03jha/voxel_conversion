import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import { join } from 'node:path'
import {createRequire} from 'node:module'
import { compileFixtures } from './test-compiler.mjs'
const require=createRequire(import.meta.url),temp=await mkdtemp(join(tmpdir(),'formshift-batch-'))
try{
  compileFixtures(temp, ["src/features/batch/zip.ts","src/features/batch/discover.ts"])
  const {Scratch,expandAssets,zipFiles}=require(join(temp,'apps/web/src/features/batch/zip.js'))
  const {discover,textureReference,attachFolder}=require(join(temp,'apps/web/src/features/batch/discover.js'))
  Object.defineProperty(globalThis,'navigator',{value:{storage:{}},configurable:true})
  const signal=new AbortController().signal
  const asset=(path,contents)=>({path,file:new File([contents],path.split('/').at(-1))})
  const expand=async(blob,name='test.zip')=>expandAssets([asset(name,blob)],new Scratch(),signal,()=>{})
  const archive=await zipFiles([asset('models/a.obj','mtllib a.mtl\nv 0 0 0\n'),asset('models/a.mtl','map_Kd ../textures/a.png'),asset('textures/a.png','png')],signal)
  const entries=await expand(archive)
  assert.deepEqual(entries.map(e=>e.path),['test/models/a.obj','test/models/a.mtl','test/textures/a.png'])
  const models=await discover(entries,signal);assert.equal(models.length,1);assert.equal(models[0].dependencies.length,2);assert.equal(models[0].error,undefined)
  const missing=await discover([asset('a.obj','mtllib a.mtl')],signal);assert.match(missing[0].error,/Missing dependency/)
  const gltf=await discover([asset('a.gltf',JSON.stringify({buffers:[{uri:'data/a.bin'}]})),asset('data/a.bin','binary')],signal);assert.equal(gltf[0].dependencies.length,1)
  const nested=await zipFiles([asset('inner.zip',archive)],signal);assert.equal((await expand(nested))[0].path,'test/inner/models/a.obj')
  const tooDeep=await zipFiles([asset('middle.zip',nested)],signal);await assert.rejects(expand(tooDeep))
  await assert.rejects(zipFiles([asset('../bad.obj','x')],signal))
  await assert.rejects(zipFiles([asset('a.obj','x'),asset('A.obj','y')],signal))
  const corrupt=new Uint8Array(await archive.arrayBuffer()),d=new DataView(corrupt.buffer)
  corrupt[30+d.getUint16(26,true)+d.getUint16(28,true)]^=1
  await assert.rejects(expand(corrupt))
  assert.equal(textureReference('-s 1 1 1 -bm 0.8 texture with spaces.png'),'texture with spaces.png')
  const usd=await discover([asset('scene/root.usda','#usda 1.0\n( subLayers = [@layers/part.usda@] )'),asset('scene/layers/part.usda','#usda 1.0\nasset image = @../textures/t.png@'),asset('scene/textures/t.png','png')],signal)
  assert.equal(usd.length,1);assert.equal(usd[0].dependencies.length,2)
  const fbx=await discover([asset('car/models/car.fbx','fbx'),asset('car/textures/body.png','png')],signal);assert.equal(fbx[0].dependencies.length,1)
  assert.equal(attachFolder(fbx[0],[asset('car/textures/normal.png','png')]).dependencies.length,2)
  console.log('PASS: ZIP64 round trip, OBJ/MTL and glTF dependencies, missing assets, nested archives, unsafe paths, duplicates, CRC')
}finally{await rm(temp,{recursive:true,force:true})}
