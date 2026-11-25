import { createReadStream, createWriteStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { S3Client, GetObjectCommand, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import type { ConversionJobData } from '../../../packages/shared/src/jobs'
import type { WorkerConfig } from './config'

export function storageClient(config: WorkerConfig) {
  return new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 1 })
}
export async function checkStorage(client: S3Client, bucket: string) {
  await client.send(new HeadBucketCommand({ Bucket: bucket }), { abortSignal: AbortSignal.timeout(10000) })
}
export async function downloadInput(client: S3Client, config: WorkerConfig, data: ConversionJobData, path: string, signal: AbortSignal) {
  const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: data.inputKey, IfMatch: data.etag }), { abortSignal: signal })
  if (!(result.Body instanceof Readable)) throw new Error('INVALID_STORAGE_STREAM')
  if (result.ContentLength !== data.originalBytes || result.ETag !== data.etag) {
    result.Body.destroy()
    throw new Error('INPUT_CHANGED')
  }
  let bytes = 0
  const limit = new Transform({ transform(chunk: Buffer, _enc, callback) {
    bytes += chunk.length
    if (bytes > data.originalBytes || bytes > config.maxInputBytes) callback(new Error('INPUT_TOO_LARGE'))
    else callback(null, chunk)
  } })
  await pipeline(result.Body, limit, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal })
  if (bytes !== data.originalBytes) throw new Error('INPUT_SIZE_MISMATCH')
}
export async function readGlbInfo(path: string, maxBytes: number) {
  const info = await stat(path)
  if (!info.isFile() || info.size < 28 || info.size > maxBytes) throw new Error('INVALID_OUTPUT')
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(20)
    if ((await handle.read(header, 0, 20, 0)).bytesRead !== 20 ||
        header.toString('ascii', 0, 4) !== 'glTF' || header.readUInt32LE(4) !== 2 ||
        header.readUInt32LE(8) !== info.size || header.toString('ascii', 16, 20) !== 'JSON') throw new Error('INVALID_GLB')
    const jsonLength = header.readUInt32LE(12)
    if (jsonLength < 4 || jsonLength > 4 * 1024 * 1024 || jsonLength % 4 || 20 + jsonLength + 8 > info.size) throw new Error('INVALID_GLB_JSON')
    const json = Buffer.alloc(jsonLength)
    if ((await handle.read(json, 0, jsonLength, 20)).bytesRead !== jsonLength) throw new Error('INVALID_GLB_JSON')
    const doc = JSON.parse(json.toString('utf8'))
    if (doc.asset?.version !== '2.0' || !Array.isArray(doc.meshes) || !doc.meshes.length || !Array.isArray(doc.buffers) || doc.buffers.length !== 1 || doc.buffers[0].uri !== undefined || (doc.images ?? []).some((image: { uri?: string }) => image.uri !== undefined)) throw new Error('INVALID_GLB_CONTENT')
    const bin = Buffer.alloc(8)
    if ((await handle.read(bin, 0, 8, 20 + jsonLength)).bytesRead !== 8 || bin.readUInt32LE(4) !== 0x004e4942 || bin.readUInt32LE(0) % 4 || 28 + jsonLength + bin.readUInt32LE(0) !== info.size) throw new Error('INVALID_GLB_BIN')
    const declared = doc.buffers[0].byteLength
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > bin.readUInt32LE(0) || bin.readUInt32LE(0) - declared > 3) throw new Error('INVALID_GLB_BIN')
    const animated = !!doc.animations?.length || !!doc.skins?.length || doc.meshes.some((mesh: { primitives?: Array<{ targets?: unknown[] }> }) => mesh.primitives?.some((primitive) => !!primitive.targets?.length))
    return { bytes: info.size, animated }
  } finally { await handle.close() }
}
export async function verifyGlb(path: string, maxBytes: number) {
  return (await readGlbInfo(path, maxBytes)).bytes
}
export async function uploadOutput(client: S3Client, config: WorkerConfig, data: ConversionJobData, path: string, bytes: number, signal: AbortSignal) {
  const body = createReadStream(path)
  try {
    await client.send(new PutObjectCommand({
      Bucket: config.bucket, Key: data.outputKey, ContentType: 'application/octet-stream', ContentLength: bytes, Body: body, IfNoneMatch: '*',
    }), { abortSignal: signal })
  } finally { body.destroy() }
}
