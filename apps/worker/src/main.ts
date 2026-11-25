import { randomUUID } from 'node:crypto'
import { access, constants } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import Redis from 'ioredis'
import { Worker } from 'bullmq'
import { QUEUE_NAME, WORKER_HEARTBEATS } from '../../../packages/shared/src/jobs'
import type { ConversionJobData, ConversionJobResult } from '../../../packages/shared/src/jobs'
import { workerConfig } from './config'
import { checkJob } from './contract'
import { convertJob, probeSandbox } from './process'
import { storageClient, checkStorage, downloadInput, uploadOutput } from './storage'

async function main() {
  const config = workerConfig()
  if (process.platform !== 'linux') throw new Error('Use a Linux or Docker worker')
  await access(config.workRoot, constants.W_OK)
  for (const script of ['validate-stl.py', 'validate-input.py', 'dense-mesh-to-glb.py', 'threemf-to-glb.py', 'blender-convert.py', 'export_handlers.py', 'embed-gltf.py', 'verify-output.py']) await access(join(config.scriptsDir, script), constants.R_OK)
  // Verify executable availability before announcing a worker.
  const { spawnSync } = await import('node:child_process')
  for (const executable of ['prlimit', config.python, config.blender, config.optimizer, 'pdftocairo', 'rsvg-convert', ...(config.sandbox === 'bwrap' ? ['bwrap'] : [])]) {
    const probe = spawnSync(executable, [executable === 'pdftocairo' ? '-v' : '--version'], { timeout: 10000, stdio: 'ignore' })
    if (probe.status !== 0) throw new Error('Required converter executable unavailable')
  }
  const probeDir = await mkdtemp(join(config.workRoot, 'formshift-probe-'))
  try { await probeSandbox(config, probeDir) } finally { await rm(probeDir, { recursive: true, force: true }) }
  const storage = storageClient(config)
  await checkStorage(storage, config.bucket)
  const id = randomUUID()
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null, connectTimeout: 5000, enableOfflineQueue: true })
  const heartbeatRedis = new Redis(config.redisUrl, { maxRetriesPerRequest: 1, commandTimeout: 5000, connectTimeout: 5000 })
  let active: AbortController | undefined
  let closing = false
  connection.on('error', () => { active?.abort(); console.error('Worker Redis connection error') })
  heartbeatRedis.on('error', () => { active?.abort(); console.error('Worker heartbeat unavailable') })
  const worker = new Worker<ConversionJobData, ConversionJobResult>(QUEUE_NAME, async (job, token) => {
    checkJob(job.id, job.data)
    const budget = Math.min(config.timeoutMs, job.data.expiresAt - Date.now())
    if (budget <= 0 || closing) throw new Error('EXPIRED_OR_SHUTTING_DOWN')
    const controller = new AbortController()
    active = controller
    const timer = setTimeout(() => controller.abort(), budget)
    let dir: string | undefined
    // Race progress/lock calls against the job deadline even if Redis is reconnecting.
    function bounded<T>(operation: Promise<T>): Promise<T> {
      const signal = controller.signal
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(new Error('JOB_DEADLINE'))
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
        operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
      })
    }
    async function ownLock() {
      controller.signal.throwIfAborted()
      if (!token || await bounded(job.extendLock(token, 120000)) !== 1) throw new Error('JOB_LOCK_LOST')
    }
    try {
      await ownLock()
      dir = await mkdtemp(join(config.workRoot, 'formshift-job-'))
      const input = join(dir, 'input.' + job.data.inputFormat.toLowerCase())
      await bounded(job.updateProgress(5))
      await downloadInput(storage, config, job.data, input, controller.signal)
      await bounded(job.updateProgress(25))
      const result = await convertJob(config, dir, input, job.data.inputFormat, job.data.outputFormat, job.data.compression, controller.signal)
      controller.signal.throwIfAborted()
      await bounded(job.updateProgress(85))
      await ownLock()
      await uploadOutput(storage, config, job.data, result.path, result.outputBytes, controller.signal)
      controller.signal.throwIfAborted()
      await ownLock()
      await bounded(job.updateProgress(100))
      controller.signal.throwIfAborted()
      return { outputBytes: result.outputBytes, convertedBytes: result.convertedBytes, compressionApplied: result.compressionApplied, warning: result.warning }
    } catch {
      // Never persist paths, signed URLs, credentials or parser output in BullMQ failures.
      throw new Error('CONVERSION_FAILED')
    } finally {
      clearTimeout(timer)
      if (dir) await rm(dir, { recursive: true, force: true }).catch(() => console.error('Temporary directory cleanup failed'))
      active = undefined
    }
  }, { connection, concurrency: 1, autorun: false, maxStalledCount: 0, lockDuration: 120000, stalledInterval: 30000 })
  worker.on('error', () => { active?.abort(); console.error('Worker queue error') })
  worker.on('completed', (job) => console.log('Conversion completed', job.id))
  worker.on('failed', (job) => console.error('Conversion failed', job?.id ?? 'unknown'))
  let heartbeatTask: Promise<void> | undefined
  let interval: ReturnType<typeof setInterval> | undefined
  async function heartbeat() {
    if (closing) return
    const now = Date.now()
    await heartbeatRedis.multi().zremrangebyscore(WORKER_HEARTBEATS, '-inf', now).zadd(WORKER_HEARTBEATS, now + 30000, id).expire(WORKER_HEARTBEATS, 120).exec().then((results) => {
      if (!results || results.some(([error]) => error)) throw new Error('HEARTBEAT_FAILED')
    })
  }
  async function shutdown() {
    if (closing) return
    closing = true
    if (interval) clearInterval(interval)
    active?.abort()
    const force = setTimeout(() => process.exit(1), 25000)
    force.unref()
    try {
      await heartbeatTask
      await heartbeatRedis.zrem(WORKER_HEARTBEATS, id).catch(() => undefined)
      await worker.close()
    } finally {
      storage.destroy()
      heartbeatRedis.disconnect()
      connection.disconnect()
      clearTimeout(force)
    }
  }
  process.once('SIGTERM', () => { void shutdown().catch(() => process.exit(1)) })
  process.once('SIGINT', () => { void shutdown().catch(() => process.exit(1)) })
  await worker.waitUntilReady()
  await heartbeat()
  interval = setInterval(() => {
    if (!heartbeatTask && !closing) heartbeatTask = heartbeat().catch(() => { active?.abort(); console.error('Heartbeat failed') }).finally(() => { heartbeatTask = undefined })
  }, 10000)
  console.log('Worker ready: existing ADVFX inputs → selected output, concurrency 1')
  await worker.run()
}
void main().catch(() => { console.error('Worker startup failed; check configuration, Redis, storage, and converter tools'); process.exit(1) })
