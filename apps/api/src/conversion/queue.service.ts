import { Injectable, Logger, OnModuleInit, OnModuleDestroy, ServiceUnavailableException, HttpException, HttpStatus, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import Redis from 'ioredis'
import { Queue } from 'bullmq'
import type { ConversionJobData, ConversionJobResult } from '../../../../packages/shared/src/jobs'
import { getCompressionLevels } from '../../../../packages/shared/src/compatibility'
import { QUEUE_NAME, WORKER_HEARTBEATS, isWorkerRoute } from '../../../../packages/shared/src/jobs'
import { settings } from './config'
import { StorageService, UPLOAD_HEADERS } from './storage.service'
import { tokenHash, validateUpload } from './validation'
import type { UploadRequest } from './validation'

interface Session extends UploadRequest {
  id: string
  hash: string
  inputKey: string
  outputKey: string
  uploadUntil: number
  expiresAt: number
  cancelled?: boolean
}
const prefix = 'formshift:{sessions}:'
const slots = prefix + 'slots'
const due = prefix + 'due'
const sessionKey = (id: string) => prefix + 'session:' + id
const lockKey = (id: string) => prefix + 'lock:' + id
// All admission keys share a Redis hash tag. Never store model bytes in Redis.
const RESERVE = `
if redis.call('SCARD', KEYS[1]) >= tonumber(ARGV[1]) then return 0 end
if redis.call('EXISTS', KEYS[3]) == 1 then return 0 end
redis.call('SET', KEYS[3], ARGV[3])
redis.call('SADD', KEYS[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[2])
return 1
`
const RATE = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end
return n
`
const RELEASE_LOCK = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(QueueService.name)
  private readonly config = settings()
  private redis?: Redis
  private queue?: Queue<ConversionJobData, ConversionJobResult>
  private timer?: ReturnType<typeof setInterval>
  private sweepTask?: Promise<void>
  private closing = false
  constructor(private readonly storage: StorageService) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL
    if (!url) {
      if (this.config.acceptJobs) throw new Error('QUEUE_ACCEPT_JOBS requires REDIS_URL')
      return
    }
    if (this.config.acceptJobs && !this.storage.configured) throw new Error('QUEUE_ACCEPT_JOBS requires temporary storage')
    const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000, commandTimeout: 10000 })
    redis.on('error', () => this.log.warn('Redis connection error'))
    this.redis = redis
    await redis.connect()
    this.queue = new Queue<ConversionJobData, ConversionJobResult>(QUEUE_NAME, {
      connection: redis,
      defaultJobOptions: { attempts: 1, removeOnComplete: false, removeOnFail: false },
    })
    this.queue.on('error', () => this.log.warn('BullMQ connection error'))
    await this.queue.waitUntilReady()
    this.timer = setInterval(() => this.startSweep(), 60000)
    this.timer.unref()
    this.startSweep()
  }
  private ready() {
    if (this.closing || !this.redis || this.redis.status !== 'ready' || !this.queue) throw new ServiceUnavailableException('Queue unavailable')
    return { redis: this.redis, queue: this.queue }
  }
  async workerCount(): Promise<number> {
    if (this.redis?.status !== 'ready') return 0
    try { return await this.redis.zcount(WORKER_HEARTBEATS, '(' + Date.now(), '+inf') }
    catch { return 0 }
  }
  async health() {
    const workers = await this.workerCount()
    const configured = this.config.acceptJobs && this.redis?.status === 'ready' && this.storage.configured
    return { redis: this.redis?.status === 'ready', storageConfigured: this.storage.configured,
      workers, acceptingJobs: configured && (workers > 0 || this.config.queueTestMode),
      conversionAvailable: configured && workers > 0 && !this.config.queueTestMode }
  }
  private async read(id: string): Promise<Session | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null
    const { redis } = this.ready()
    const raw = await redis.get(sessionKey(id))
    return raw ? JSON.parse(raw) as Session : null
  }
  private async authorized(id: string, authorization?: string) {
    const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
    const s = await this.read(id)
    if (!token || !s || !timingSafeEqual(Buffer.from(s.hash, 'hex'), Buffer.from(tokenHash(token), 'hex'))) throw new NotFoundException('Job not found')
    return s
  }
  private async lock<T>(id: string, action: () => Promise<T>): Promise<T> {
    const { redis } = this.ready()
    const token = randomUUID()
    if (await redis.set(lockKey(id), token, 'PX', 120000, 'NX') !== 'OK') throw new ConflictException('Job is busy; retry shortly')
    try { return await action() }
    finally { await redis.eval(RELEASE_LOCK, 1, lockKey(id), token).catch(() => undefined) }
  }
  async create(body: unknown) {
    if (!this.config.acceptJobs || !this.storage.configured) throw new ServiceUnavailableException('Job submission is disabled')
    const request = validateUpload(body)
    if (!isWorkerRoute(request.inputFormat, request.outputFormat) || request.color !== null) throw new BadRequestException('Unsupported conversion pair; custom color is paused')
    if (!this.config.queueTestMode && await this.workerCount() < 1) throw new ServiceUnavailableException('No conversion worker is available')
    const { redis } = this.ready()
    const count = Number(await redis.eval(RATE, 1, prefix + 'create-rate'))
    if (count > this.config.createsPerMinute) throw new HttpException('Upload creation rate limit reached', HttpStatus.TOO_MANY_REQUESTS)
    const id = randomUUID()
    const token = randomBytes(32).toString('hex')
    const now = Date.now()
    const session: Session = {
      ...request, id, hash: tokenHash(token),
      inputKey: 'temporary/' + id + '/input.' + request.inputFormat.toLowerCase(),
      outputKey: 'temporary/' + id + '/output.' + request.outputFormat.toLowerCase(),
      uploadUntil: now + this.config.uploadSeconds * 1000,
      expiresAt: now + this.config.retentionSeconds * 1000,
    }
    // Reserve before returning a signed URL, including uploads that never submit.
    const ok = await redis.eval(RESERVE, 3, slots, due, sessionKey(id), this.config.capacity, id, JSON.stringify(session), session.uploadUntil + 60000)
    if (Number(ok) !== 1) throw new HttpException('Queue capacity reached', HttpStatus.TOO_MANY_REQUESTS)
    try {
      const uploadUrl = await this.storage.signUpload(session.inputKey, request.originalBytes, this.config.uploadSeconds)
      return { id, token, uploadUrl, uploadHeaders: UPLOAD_HEADERS, uploadExpiresAt: session.uploadUntil, expiresAt: session.expiresAt }
    } catch (error) {
      // Keep reservation until cleanup if signing fails; no untracked object key.
      await this.markCancelled(session).catch(() => undefined)
      throw error
    }
  }
  private async markCancelled(s: Session) {
    const { redis } = this.ready()
    await redis.multi().set(sessionKey(s.id), JSON.stringify({ ...s, cancelled: true })).zadd(due, s.uploadUntil + 60000, s.id).exec()
  }
  async submit(id: string, authorization?: string) {
    await this.authorized(id, authorization)
    return this.lock(id, async () => {
      const s = await this.authorized(id, authorization)
      const { queue, redis } = this.ready()
      if (s.cancelled || Date.now() >= s.expiresAt) throw new ConflictException('Job expired or cancelled')
      const existing = await queue.getJob(id)
      if (existing) return { id, status: await existing.getState() }
      if (!this.config.acceptJobs) throw new ServiceUnavailableException('Job submission is disabled')
      if (!isWorkerRoute(s.inputFormat, s.outputFormat) || !getCompressionLevels(s.outputFormat).includes(s.compression) || s.color !== null) throw new BadRequestException('Conversion route not enabled')
      if (!this.config.queueTestMode && await this.workerCount() < 1) throw new ServiceUnavailableException('No conversion worker is available')
      if (Date.now() >= s.uploadUntil) throw new ConflictException('Upload session expired')
      const object = await this.storage.head(s.inputKey)
      if (!object) throw new ConflictException('Upload not found; finish uploading first')
      if (object.ContentLength !== s.originalBytes || !object.ETag) {
        await this.markCancelled(s)
        throw new BadRequestException('Uploaded file size does not match the declared size')
      }
      // Extend cleanup deadline before publishing; retry with the same job id is idempotent.
      await redis.zadd(due, s.expiresAt, id)
      try { await queue.add('convert', {
        inputKey: s.inputKey, outputKey: s.outputKey, inputFormat: s.inputFormat, outputFormat: s.outputFormat,
        originalBytes: s.originalBytes, compression: s.compression, color: s.color,
        etag: object.ETag, expiresAt: s.expiresAt,
      }, { jobId: id }) } catch (error) {
        // Revisit quickly even if Redis accepted the job before the connection failed.
        // The sweeper checks actual BullMQ state before deleting any input.
        await redis.zadd(due, Math.max(Date.now() + 60000, s.uploadUntil + 60000), id).catch(() => undefined)
        throw error
      }
      const published = await queue.getJob(id)
      return { id, status: published ? await published.getState() : 'waiting' }
    })
  }
  async status(id: string, authorization?: string) {
    const s = await this.authorized(id, authorization)
    if (s.cancelled) return { id, status: 'cancelled' }
    if (Date.now() >= s.expiresAt) return { id, status: 'expired' }
    const { queue } = this.ready()
    const job = await queue.getJob(id)
    if (!job) return { id, status: Date.now() >= s.uploadUntil ? 'expired' : 'awaiting-upload', originalBytes: s.originalBytes }
    const state = await job.getState()
    // Position is a snapshot; no ETA until actual processing metrics exist.
    let position: number | null = null
    if (state === 'waiting') {
      const waiting = await queue.getWaiting(0, this.config.capacity - 1)
      const index = waiting.findIndex((item) => item.id === id)
      if (index >= 0) position = index + 1
    }
    const outputBytes = state === 'completed' && Number.isSafeInteger(job.returnvalue?.outputBytes) && job.returnvalue.outputBytes > 0 ? job.returnvalue.outputBytes : null
    const convertedBytes = state === 'completed' && Number.isSafeInteger(job.returnvalue?.convertedBytes) && job.returnvalue.convertedBytes > 0 ? job.returnvalue.convertedBytes : null
    return { id, status: state, outputFormat: s.outputFormat, position, etaSeconds: null, convertedBytes, compressionApplied: state === 'completed' ? job.returnvalue?.compressionApplied ?? false : null, warning: state === 'completed' ? job.returnvalue?.warning ?? null : null, compressionReductionPercent: outputBytes !== null && convertedBytes !== null ? Math.round((1 - outputBytes / convertedBytes) * 10000) / 100 : null, error: state === 'failed' ? 'Conversion failed. Check the input file, missing dependencies or model complexity.' : null, progress: typeof job.progress === 'number' ? job.progress : null, originalBytes: s.originalBytes, outputBytes, reductionPercent: outputBytes === null ? null : Math.round((1 - outputBytes / s.originalBytes) * 10000) / 100 }
  }
  async cancel(id: string, authorization?: string) {
    await this.authorized(id, authorization)
    return this.lock(id, async () => {
      const s = await this.authorized(id, authorization)
      if (s.cancelled) return { id, status: 'cancelled' }
      const { queue } = this.ready()
      const job = await queue.getJob(id)
      if (job) {
        const state = await job.getState()
        if (!['waiting', 'delayed', 'paused', 'prioritized'].includes(state)) throw new ConflictException('Only waiting jobs can be cancelled in this phase')
        try { await job.remove() } catch { throw new ConflictException('Job already started; cancellation unavailable') }
      }
      // Do not delete the object before the signed PUT expires; otherwise it can be recreated.
      await this.markCancelled(s)
      return { id, status: 'cancelled' }
    })
  }
  async download(id: string, authorization?: string) {
    const s = await this.authorized(id, authorization)
    if (s.cancelled || Date.now() >= s.expiresAt) throw new ConflictException('Job expired or cancelled')
    const { queue } = this.ready()
    const job = await queue.getJob(id)
    if (!job || await job.getState() !== 'completed') throw new ConflictException('Output not ready')
    const output = await this.storage.head(s.outputKey)
    if (!output || !output.ContentLength) throw new NotFoundException('Output unavailable')
    const seconds = Math.min(this.config.downloadSeconds, Math.floor((s.expiresAt - Date.now()) / 1000))
    if (seconds < 1) throw new ConflictException('Job expired')
    return { url: await this.storage.signDownload(s.outputKey, seconds, s.outputFormat), filename: 'converted.' + s.outputFormat.toLowerCase(), expiresIn: seconds }
  }
  private startSweep() {
    if (this.closing || this.sweepTask || !this.storage.configured) return
    this.sweepTask = this.sweep().catch(() => this.log.warn('Temporary job cleanup will retry')).finally(() => { this.sweepTask = undefined })
  }
  private async sweep() {
    const { redis, queue } = this.ready()
    // Bounded work per pass, distributed per-session lock for multiple API replicas.
    const expired = await redis.zrangebyscore(due, '-inf', Date.now(), 'LIMIT', 0, 100)
    for (const id of expired) {
      if (this.closing) break
      try {
        await this.lock(id, async () => {
          const score = await redis.zscore(due, id)
          if (score === null || Number(score) > Date.now()) return
          const s = await this.read(id)
          const job = await queue.getJob(id)
          if (job && await job.getState() === 'active') {
            await redis.zadd(due, Date.now() + 60000, id)
            return
          }
          // A job may have been added but the HTTP request failed. Preserve until expiry.
          if (s && job && !s.cancelled && Date.now() < s.expiresAt) {
            await redis.zadd(due, s.expiresAt, id)
            return
          }
          if (job) await job.remove()
          if (s) {
            await this.storage.remove(s.inputKey)
            await this.storage.remove(s.outputKey)
          }
          await redis.multi().del(sessionKey(id)).srem(slots, id).zrem(due, id).exec()
        })
      } catch { /* another replica owns the lock or cleanup failed; retry next pass */ }
    }
    // Free capacity for completed/failed jobs, retain their metadata until expiry.
    const reserved = await redis.smembers(slots)
    for (const id of reserved) {
      if (this.closing) break
      const job = await queue.getJob(id)
      if (job && ['completed', 'failed'].includes(await job.getState())) await redis.srem(slots, id)
    }
  }
  async onModuleDestroy() {
    this.closing = true
    if (this.timer) clearInterval(this.timer)
    await this.sweepTask
    await this.queue?.close()
    if (this.redis) this.redis.disconnect()
  }
}
