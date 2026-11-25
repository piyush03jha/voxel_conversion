import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import type { ModelFormat } from '../../../../packages/shared/src/compatibility'

export const UPLOAD_HEADERS = { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly bucket = process.env.STORAGE_BUCKET
  private readonly client: S3Client | undefined
  constructor() {
    const endpoint = process.env.STORAGE_ENDPOINT
    const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID
    const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY
    if (endpoint && accessKeyId && secretAccessKey && this.bucket) {
      const parsed = new URL(endpoint)
      if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && ['localhost', '127.0.0.1', 'storage'].includes(parsed.hostname))) throw new Error('Storage endpoint must use HTTPS in production')
      this.client = new S3Client({
        endpoint, region: process.env.STORAGE_REGION ?? 'auto',
        forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== 'false',
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
        maxAttempts: 1,
      })
    }
  }
  get configured() { return !!this.client && !!this.bucket }
  private ready() {
    if (!this.client || !this.bucket) throw new ServiceUnavailableException('Temporary storage not configured')
    return { client: this.client, Bucket: this.bucket }
  }
  async signUpload(key: string, bytes: number, expiresIn: number) {
    const { client, Bucket } = this.ready()
    const url = await getSignedUrl(client, new PutObjectCommand({
      Bucket, Key: key, ContentType: UPLOAD_HEADERS['Content-Type'], ContentLength: bytes, IfNoneMatch: '*',
    }), { expiresIn, signableHeaders: new Set(['content-length', 'content-type', 'if-none-match']) })
    // Refuse an upload if the SDK/provider configuration silently drops a security header.
    const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
    if (!['content-length', 'content-type', 'if-none-match'].every((h) => signed.includes(h))) throw new ServiceUnavailableException('Storage signing configuration is unsafe')
    return url
  }
  async head(key: string) {
    const { client, Bucket } = this.ready()
    try {
      return await client.send(new HeadObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(8000) })
    } catch (error) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } }
      if (e.$metadata?.httpStatusCode === 404 || e.name === 'NotFound' || e.name === 'NoSuchKey') return null
      throw new ServiceUnavailableException('Temporary storage unavailable')
    }
  }
  async remove(key: string) {
    const { client, Bucket } = this.ready()
    await client.send(new DeleteObjectCommand({ Bucket, Key: key }), { abortSignal: AbortSignal.timeout(8000) })
  }
  async copy(source: string, target: string, etag: string) {
    const { client, Bucket } = this.ready()
    await client.send(new CopyObjectCommand({ Bucket, Key: target, CopySource: encodeURIComponent(Bucket) + '/' + source.split('/').map(encodeURIComponent).join('/'), CopySourceIfMatch: etag }), { abortSignal: AbortSignal.timeout(60000) })
  }
  async signDownload(key: string, expiresIn: number, format: ModelFormat | 'PNG', preview = false) {
    const { client, Bucket } = this.ready()
    return getSignedUrl(client, new GetObjectCommand({
      Bucket, Key: key, ResponseContentDisposition: 'attachment; filename="' + (preview ? 'preview.' : 'converted.') + format.toLowerCase() + '"', ResponseContentType: 'application/octet-stream',
    }), { expiresIn })
  }
  onModuleDestroy() { this.client?.destroy() }
}
