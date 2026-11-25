// Compile only the dependency-free codec to a temporary CommonJS directory.
// Tests execute the actual source in Node; Web Worker/UI integration needs browser smoke tests.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
const require = createRequire(import.meta.url)
const temp = await mkdtemp(join(tmpdir(),'formshift-browser-test-'))
try {
  const tsc = process.env.FORMSHIFT_TSC || require.resolve('typescript/bin/tsc')
  execFileSync(process.execPath,[tsc,'--module','commonjs','--moduleResolution','node','--target','es2022','--lib','ES2022,DOM','--skipLibCheck','--strict','--rootDir',resolve('../..'),'--outDir',temp,'src/features/converter/mesh-codec.ts'],{stdio:'inherit'})
  const {convertBytes}=require(join(temp,'apps/web/src/features/converter/mesh-codec.js'))
  const {browserRoute,LOCAL_MAX_BYTES}=require(join(temp,'apps/web/src/features/converter/browser-route.js'))
  const {getSupportedOutputs,ACCEPTED_FORMATS}=require(join(temp,'packages/shared/src/compatibility.js'))
  const encode=text=>new TextEncoder().encode(text).buffer
  const stl=encode('solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t\n')
  const obj=encode('v 0 0 0\nv 1 0 0\nv 0 0 -1\nf 1 2 3\n')
  const ply=encode('ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n')
  const expected=['STL','OBJ','PLY','GLB','GLTF']
  for(const [input,bytes] of [['STL',stl],['OBJ',obj],['PLY',ply]]){
    for(const output of expected){
      const result=await convertBytes(bytes,input,output).arrayBuffer()
      assert.ok(result.byteLength>0,input+' to '+output)
      if(output==='STL')assert.equal(result.byteLength,134)
      if(output==='GLB')assert.equal(new DataView(result).getUint32(0,true),0x46546c67)
      if(output==='GLTF')assert.ok(JSON.parse(new TextDecoder().decode(result)).buffers[0].uri.startsWith('data:'))
      if(['STL','OBJ','PLY'].includes(output)){
        const round=await convertBytes(result,output,'STL').arrayBuffer()
        assert.equal(round.byteLength,134)
        // Triangle world coordinates must survive round trip, including Z/Y-up conversion.
        const d=new DataView(round)
        assert.deepEqual(Array.from({length:9},(_,i)=>d.getFloat32(96+i*4,true)||0),[0,0,0,1,0,0,0,1,0])
      }
    }
  }
  const glb=await convertBytes(stl,'STL','GLB').arrayBuffer()
  const gltf=await convertBytes(glb,'GLB','GLTF').arrayBuffer()
  const again=await convertBytes(gltf,'GLTF','GLB').arrayBuffer()
  assert.deepEqual(new Uint8Array(again),new Uint8Array(glb))
  const same=await convertBytes(glb,'GLB','GLB').arrayBuffer()
  assert.deepEqual(new Uint8Array(same),new Uint8Array(glb))
  for(const [input,bytes] of [['STL',new ArrayBuffer(84)],['STL',encode('solid invalid')],['OBJ',encode('mtllib external.mtl\nv 0 0 0\nf 1 2 3')],['PLY',encode('ply\nformat binary_little_endian 1.0\nelement vertex 999999999\nend_header\n')],['GLTF',encode('{"asset":{"version":"2.0"},"buffers":[{"byteLength":12,"uri":"https://example.com/file.bin"}],"meshes":[{}]}')]]) assert.throws(()=>convertBytes(bytes,input,'GLB'))
  const old=globalThis.Worker
  globalThis.Worker=class {}
  try {
    assert.equal(browserRoute('STL','GLB',100,'None'),true)
    assert.equal(browserRoute('STL','GLB',LOCAL_MAX_BYTES+1,'None'),false)
    assert.equal(browserRoute('STL','GLB',100,'High'),false)
    assert.equal(browserRoute('FBX','GLB',100,'None'),false)
    assert.equal(browserRoute('STL','PDF',100,'None'),false)
    assert.equal(ACCEPTED_FORMATS.flatMap(getSupportedOutputs).length,188)
  }finally{if(old===undefined)delete globalThis.Worker;else globalThis.Worker=old}
  console.log('PASS: 15 geometry routes, coordinate round trips, GLB/GLTF repacking, invalid-input rejection, routing limits')
}finally{await rm(temp,{recursive:true,force:true})}
