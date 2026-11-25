import { spawn } from 'node:child_process'
import { join } from 'node:path'
import type { WorkerConfig } from './config'

export async function runConverter(config: WorkerConfig, dir: string, input: string, output: string, signal: AbortSignal) {
  if (process.platform !== 'linux') throw new Error('LINUX_WORKER_REQUIRED')
  signal.throwIfAborted()
  // No inherited Redis URL, object-storage credentials, or application environment.
  const env = {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: dir, TMPDIR: dir, XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir,
    PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    OMP_NUM_THREADS: String(config.threads), OPENBLAS_NUM_THREADS: String(config.threads),
    VOXEL3D_GLTF_MAX_FACES: '0', VOXEL3D_DENSE_MAX_TRIANGLES: String(config.maxTriangles),
    VOXEL3D_DENSE_MAX_CELLS: String(config.maxCells),
    WORKER_MAX_TRIANGLES: String(config.maxTriangles),
  }
  const convert = config.engine === 'native'
    ? [config.python, '-I', join(config.scriptsDir, 'dense-mesh-to-glb.py'), '--input', input, '--output', output, '--ext', '.stl']
    : [config.blender, '--background', '--factory-startup', '--disable-autoexec', '--threads', String(config.threads), '--python-exit-code', '1', '--python', join(config.scriptsDir, 'blender-convert.py'), '--', '--input', input, '--output', output, '--ext', '.stl']
  // Strict preflight is separate from the existing converter; both run with limits.
  const commands = [[config.python, '-I', join(config.scriptsDir, 'validate-stl.py'), input], convert]
  for (const command of commands) {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const child = spawn('prlimit', [
        '--as=' + config.memoryMb * 1024 * 1024, '--fsize=' + config.maxOutputBytes,
        '--cpu=' + Math.ceil(config.timeoutMs / 1000), '--core=0', '--nofile=128', '--', ...command,
      ], { cwd: dir, env, detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
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
        // Ensure subprocesses cannot outlive their conversion.
        if (child.pid) { try { process.kill(-child.pid, 'SIGKILL') } catch {} }
        if (aborted) reject(new Error('CONVERSION_TIMEOUT_OR_SHUTDOWN'))
        else if (code !== 0) reject(new Error('INVALID_OR_COMPLEX_MODEL'))
        else resolve()
      })
    })
  }
}
