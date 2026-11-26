import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { stat, rm } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import type { WorkerConfig } from './config'
import { getOutputWarning } from '../../../packages/shared/src/compatibility'
import type { ModelFormat } from '../../../packages/shared/src/compatibility'
import type { CompressionLevel } from '../../../packages/shared/src/jobs'
import { previewKind, PREVIEW_MAX_BYTES } from '../../../packages/shared/src/preview'
import { open } from 'node:fs/promises'
import { readGlbInfo } from './storage'

function environment(config: WorkerConfig, dir: string) {
  return {
    PATH: '/usr/local/bin:/usr/bin:/bin:/opt/blender',
    HOME: dir, TMPDIR: dir, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir,
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    OMP_NUM_THREADS: String(config.threads), OPENBLAS_NUM_THREADS: String(config.threads),
    VOXEL3D_GLTF_MAX_FACES: '0', VOXEL3D_DENSE_MAX_TRIANGLES: String(config.maxTriangles),
    VOXEL3D_DENSE_MAX_CELLS: String(config.maxCells),
    VOXEL3D_3MF_MAX_TRIANGLES: String(config.maxTriangles),
    VOXEL3D_3MF_MAX_XML_MB: String(config.maxArchiveMb),
    WORKER_MAX_ARCHIVE_MB: String(config.maxArchiveMb),
    WORKER_MAX_TRIANGLES: String(config.maxTriangles),
    NODE_OPTIONS: '--max-old-space-size=' + config.optimizerHeapMb,
    PDF_TO_SVG_BIN: '/usr/bin/pdftocairo',
  }
}
function sandboxCommand(config: WorkerConfig, dir: string, args: string[]): string[] {
  if (config.sandbox === 'trusted-local') return args
  // No host home, application source, environment file or network. The only writable
  // host directory is the job directory. Fail closed if namespaces are unavailable.
  const roots = ['/usr', '/bin', '/lib', '/lib64', '/opt/blender', '/opt/3mf-addon']
    .filter((path) => existsSync(path)).flatMap((path) => ['--ro-bind', path, path])
  const etc = ['/etc/ld.so.cache', '/etc/fonts', '/etc/localtime'].filter((path) => existsSync(path)).flatMap((path) => ['--ro-bind', path, path])
  return ['bwrap', '--unshare-all', '--die-with-parent', ...roots, ...etc,
    '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/var',
    '--ro-bind', config.scriptsDir, config.scriptsDir, '--bind', dir, dir,
    '--chdir', dir, '--', ...args]
}
class ConverterExit extends Error {
  constructor(readonly code: number | null) { super(code === null ? 'PROCESS_RESOURCE_LIMIT' : 'INVALID_OR_COMPLEX_MODEL') }
}
async function run(config: WorkerConfig, dir: string, args: string[], signal: AbortSignal, addressMb: number | null) {
  if (process.platform !== 'linux') throw new Error('LINUX_WORKER_REQUIRED')
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const limits = ['--fsize=' + config.maxOutputBytes, '--cpu=' + Math.ceil(config.timeoutMs / 1000), '--core=0', '--nofile=128']
    if (addressMb !== null) limits.unshift('--as=' + addressMb * 1024 * 1024)
    const child = spawn('prlimit', [...limits, '--', ...sandboxCommand(config, dir, args)],
      { cwd: dir, env: environment(config, dir), detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
    let aborted = false
    const kill = () => {
      aborted = true
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
    }
    signal.addEventListener('abort', kill, { once: true })
    if (signal.aborted) kill()
    child.once('error', () => { signal.removeEventListener('abort', kill); reject(new Error('CONVERTER_UNAVAILABLE')) })
    child.once('close', (code) => {
      signal.removeEventListener('abort', kill)
      if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
      if (aborted) reject(new Error('CONVERSION_TIMEOUT_OR_SHUTDOWN'))
      else if (code !== 0) reject(new ConverterExit(code))
      else resolve()
    })
  })
}
export async function probeSandbox(config: WorkerConfig, dir: string) {
  await run(config, dir, [config.python, '-I', '-c', 'print("ready")'], AbortSignal.timeout(10000), config.memoryMb)
}
async function objHasMaterials(input: string, signal: AbortSignal) {
  // Full-file scan, bounded chunks, not just the first 64 KiB.
  const stream = createReadStream(input, { encoding: 'latin1', signal })
  let tail = ''
  for await (const chunk of stream) {
    const text = tail + String(chunk)
    if (/(?:^|[\r\n])\s*mtllib\s+/i.test(text)) return true
    tail = text.slice(-256)
  }
  return false
}
export async function runConverter(config: WorkerConfig, dir: string, input: string, output: string, format: ModelFormat, signal: AbortSignal): Promise<string> {
  const ext = '.' + format.toLowerCase()
  if (format === 'STL') await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'validate-stl.py'), input], signal, config.memoryMb)
  else await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'validate-input.py'), input, ext], signal, config.memoryMb)
  if (format === 'GLB') { await readGlbInfo(input, config.maxOutputBytes); return input }
  let native: string[] | null = null
  if (format === '3MF') native = ['threemf-to-glb.py']
  if (format === 'PLY' || (format === 'STL' && config.engine === 'native')) native = ['dense-mesh-to-glb.py', '--ext', ext]
  if (format === 'OBJ' && (await stat(input)).size >= 30 * 1024 * 1024 && !await objHasMaterials(input, signal)) native = ['dense-mesh-to-glb.py', '--ext', ext]
  if (native) {
    const [script, ...extra] = native
    try {
      await run(config, dir, [config.python, '-I', join(config.scriptsDir, script), '--input', input, '--output', output, ...extra], signal, config.memoryMb)
      return output
    } catch (error) {
      // Same fallback contract as ADVFX: only explicitly unsupported content (3).
      // Never retry invalid, oversized, timed-out or OOM files. STL stays native.
      if (!(error instanceof ConverterExit) || error.code !== 3 || format === 'STL') throw error
      await rm(output, { force: true })
    }
  }
  await run(config, dir, [config.blender, '--background', '--factory-startup', '--disable-autoexec',
    '--threads', String(config.threads), '--python-exit-code', '1', '--python', join(config.scriptsDir, 'blender-convert.py'),
    '--', '--input', input, '--output', output, '--ext', ext], signal, config.blenderAddressMb)
  return output
}

export function optimizationArgs(level: Exclude<CompressionLevel, 'None'>, animated: boolean, input: string, output: string) {
  // Reuse ADVFX optimize flags; presets differ by texture size and optional static mesh simplification.
  const textureSize = { Low: '2048', Medium: '2048', High: '1024' }[level]
  const simplify = level === 'High' && !animated
  return ['optimize', input, output, '--compress', 'meshopt', '--meshopt-level', 'medium',
    '--texture-compress', 'webp', '--texture-size', textureSize,
    '--flatten', 'false', '--join', 'false', '--instance', 'false', '--palette', 'false',
    '--simplify', String(simplify), '--simplify-ratio', simplify ? '0.8' : '1',
    '--simplify-error', '0.001', '--simplify-lock-border', 'true']
}
export async function optimizeGlb(config: WorkerConfig, dir: string, input: string, level: CompressionLevel, signal: AbortSignal) {
  const base = await readGlbInfo(input, config.maxOutputBytes)
  const unchanged = { path: input, convertedBytes: base.bytes, outputBytes: base.bytes, compressionApplied: false, warning: null as string | null }
  if (level === 'None') return unchanged
  const output = join(dir, 'optimized.glb')
  try {
    const args = optimizationArgs(level, base.animated, input, output)
    // V8/WASM reserve virtual address ranges; use bounded Node heap and the container
    // memory limit, not Python's RLIMIT_AS. The overall job still has a hard deadline.
    await run(config, dir, [config.optimizer, ...args], AbortSignal.any([signal, AbortSignal.timeout(config.optimizerTimeoutMs)]), null)
    const result = await readGlbInfo(output, config.maxOutputBytes)
    signal.throwIfAborted()
    if (result.bytes >= base.bytes) {
      await rm(output, { force: true })
      return { ...unchanged, warning: 'Compression did not reduce the GLB size; original converted GLB retained.' }
    }
    return { path: output, convertedBytes: base.bytes, outputBytes: result.bytes, compressionApplied: true,
      warning: level === 'High' && !base.animated ? 'High compression may simplify static geometry and reduce texture resolution.' :
        level === 'High' && base.animated ? 'Animation/skin/morph targets detected; mesh simplification disabled. Texture resolution may be reduced.' :
        'Mesh and texture optimization may change appearance; review the result.' }
  } catch {
    await rm(output, { force: true }).catch(() => undefined)
    signal.throwIfAborted()
    return { ...unchanged, warning: 'Compression failed or exceeded its limit; original converted GLB retained.' }
  }
}

async function verifyOther(config: WorkerConfig, dir: string, path: string, format: ModelFormat, signal: AbortSignal) {
  const info = await stat(path)
  if (!info.isFile() || info.size < 1 || info.size > config.maxOutputBytes) throw new Error('INVALID_OUTPUT')
  if (format === 'GLTF') {
    // Generated by embed-gltf.py from verified GLB; validate self-contained JSON in a bounded subprocess.
    await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'validate-input.py'), path, '.gltf'], signal, config.memoryMb)
  } else {
    await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'verify-output.py'), path, format], signal, config.memoryMb)
  }
  return info.size
}
export async function convertJob(config: WorkerConfig, dir: string, input: string, source: ModelFormat, target: ModelFormat, level: CompressionLevel, signal: AbortSignal) {
  const output = join(dir, 'output.' + target.toLowerCase())
  const warning = getOutputWarning(target)
  if (target === 'GLB') {
    const converted = await runConverter(config, dir, input, output, source, signal)
    return optimizeGlb(config, dir, converted, level, signal)
  }
  if (target === 'GLTF') {
    // Blender 4.x removed embedded glTF; use the existing GLB exporter only here.
    const converted = await runConverter(config, dir, input, join(dir, 'intermediate.glb'), source, signal)
    await readGlbInfo(converted, config.maxOutputBytes)
    await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'embed-gltf.py'), converted, output], signal, config.memoryMb)
    const bytes = await verifyOther(config, dir, output, target, signal)
    return { path: output, convertedBytes: bytes, outputBytes: bytes, compressionApplied: false, warning }
  }
  const ext = '.' + source.toLowerCase()
  if (source === 'STL') await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'validate-stl.py'), input], signal, config.memoryMb)
  else await run(config, dir, [config.python, '-I', join(config.scriptsDir, 'validate-input.py'), input, ext], signal, config.memoryMb)
  if (target === 'PDF' || target === 'SVG') {
    if (source !== 'PDF' && source !== 'SVG') throw new Error('INVALID_VECTOR_ROUTE')
    let path = output
    if (source === target) path = input
    else if (target === 'SVG') await run(config, dir, ['pdftocairo', '-f', '1', '-l', '1', '-svg', input, output], signal, config.memoryMb)
    else await run(config, dir, ['rsvg-convert', '-f', 'pdf', '-o', output, input], signal, config.memoryMb)
    const bytes = await verifyOther(config, dir, path, target, signal)
    return { path, convertedBytes: bytes, outputBytes: bytes, compressionApplied: false, warning }
  }
  if (source === '3MF' && target === '3MF' && level !== 'None') {
    const original=(await stat(input)).size
    const candidate=join(dir,'repacked.3mf')
    try {
      await run(config,dir,[config.python,'-I',join(config.scriptsDir,'repack-3mf.py'),input,candidate,String({Low:1,Medium:6,High:9}[level])],signal,config.memoryMb)
      const bytes=(await stat(candidate)).size
      if(bytes>0&&bytes<original)return {path:candidate,convertedBytes:original,outputBytes:bytes,compressionApplied:true,warning:'Lossless 3MF ZIP recompression; model entries preserved.'}
    } catch { signal.throwIfAborted() }
    return {path:input,convertedBytes:original,outputBytes:original,compressionApplied:false,warning:'Original 3MF package retained; no smaller lossless result.'}
  }
  // Direct import → chosen exporter: no forced GLB roundtrip for these targets.
  const candidate = join(dir, 'optimized.' + target.toLowerCase())
  const args = [config.blender, '--background', '--factory-startup', '--disable-autoexec',
    '--threads', String(config.threads), '--python-exit-code', '1', '--python', join(config.scriptsDir, 'blender-convert.py'),
    '--', '--input', input, '--output', output, '--ext', ext, '--target', target, '--compression', level]
  // Publish baseline before optimizing. Candidate generation happens in same scene, not a second import.
  if (level !== 'None') args.push('--candidate', candidate)
  await run(config, dir, args, signal, config.blenderAddressMb)
  const bytes = await verifyOther(config, dir, output, target, signal)
  if (level !== 'None' && existsSync(candidate)) {
    try {
      const candidateBytes = await verifyOther(config, dir, candidate, target, signal)
      if (candidateBytes < bytes && (source !== target || candidateBytes < (await stat(input)).size)) return { path: candidate, convertedBytes: source === target ? (await stat(input)).size : bytes, outputBytes: candidateBytes, compressionApplied: true, warning: [warning, target === '3MF' ? 'ZIP compression retained the mesh geometry.' : 'Static mesh simplification may reduce geometry detail.'].filter(Boolean).join(' ') }
    } catch { signal.throwIfAborted() }
    await rm(candidate, { force: true })
  }
  if (source === target && level !== 'None') {
    const original=(await stat(input)).size
    return {path:input,convertedBytes:original,outputBytes:original,compressionApplied:false,warning:'Original file retained; no smaller verified compression candidate.'}
  }
  return { path: output, convertedBytes: bytes, outputBytes: bytes, compressionApplied: false,
    warning: [warning, level !== 'None' ? 'Compression unavailable or not smaller; original export retained.' : null].filter(Boolean).join(' ') || null }
}

export async function createPreview(config: WorkerConfig, dir: string, input: string, source: ModelFormat, signal: AbortSignal) {
  const kind=previewKind(source), output=join(dir,'preview.'+kind.toLowerCase()), ext='.'+source.toLowerCase()
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(120000)])
  const boundedConfig={...config,maxOutputBytes:PREVIEW_MAX_BYTES}
  if(source==='STL')await run(config,dir,[config.python,'-I',join(config.scriptsDir,'validate-stl.py'),input],deadline,config.memoryMb)
  else await run(config,dir,[config.python,'-I',join(config.scriptsDir,'validate-input.py'),input,ext],deadline,config.memoryMb)
  if(source==='PDF')await run(boundedConfig,dir,['pdftocairo','-f','1','-l','1','-singlefile','-scale-to','1200','-png',input,join(dir,'preview')],deadline,config.memoryMb)
  else if(source==='SVG')await run(boundedConfig,dir,['rsvg-convert','-w','1200','-h','1200','--keep-aspect-ratio','-o',output,input],deadline,config.memoryMb)
  else await run(boundedConfig,dir,[config.blender,'--background','--factory-startup','--disable-autoexec','--threads',String(config.threads),'--python-exit-code','1','--python',join(config.scriptsDir,'blender-convert.py'),'--','--input',input,'--output',output,'--ext',ext,'--preview'],deadline,config.blenderAddressMb)
  let bytes:number
  if(kind==='GLB')bytes=(await readGlbInfo(output,PREVIEW_MAX_BYTES)).bytes
  else{
    bytes=(await stat(output)).size
    if(bytes<33||bytes>PREVIEW_MAX_BYTES)throw new Error('INVALID_PREVIEW')
    const handle=await open(output,'r')
    try{
      const h=Buffer.alloc(24)
      if((await handle.read(h,0,h.length,0)).bytesRead!==24||h.toString('hex',0,8)!=='89504e470d0a1a0a'||h.toString('ascii',12,16)!=='IHDR'||h.readUInt32BE(16)<1||h.readUInt32BE(16)>1200||h.readUInt32BE(20)<1||h.readUInt32BE(20)>1200)throw new Error('INVALID_PREVIEW')
    }finally{await handle.close()}
  }
  deadline.throwIfAborted()
  return {path:output,outputBytes:bytes,convertedBytes:bytes,compressionApplied:false,warning:kind==='PNG'?'Raster document preview (first page for PDF).':'Approximate static geometry preview; large meshes may be sampled.'}
}
