import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common'
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, ListPartsCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { partBytes } from '../../../../packages/shared/src/upload'
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
  async beginMultipart(key:string) {
    const {client,Bucket}=this.ready()
    const result=await client.send(new CreateMultipartUploadCommand({Bucket,Key:key,ContentType:'application/octet-stream'}),{abortSignal:AbortSignal.timeout(15000)})
    if(!result.UploadId)throw new ServiceUnavailableException('Storage did not create an upload session')
    return result.UploadId
  }
  async signPart(key:string,uploadId:string,part:number,bytes:number,expiresIn:number){
    const {client,Bucket}=this.ready()
    const url=await getSignedUrl(client,new UploadPartCommand({Bucket,Key:key,UploadId:uploadId,PartNumber:part,ContentLength:bytes}),{expiresIn,signableHeaders:new Set(['content-length'])})
    if(!new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';').includes('content-length'))throw new ServiceUnavailableException('Multipart length signing unavailable')
    return url
  }
  async completeMultipart(key:string,uploadId:string,size:number,partSize:number,partCount:number){
    const {client,Bucket}=this.ready()
    // Read authoritative part sizes/ETags from storage. No untrusted ETag list in the API.
    const deadline=AbortSignal.timeout(60000)
    const parts:{PartNumber:number;ETag:string}[]=[]
    let marker:string|undefined
    do{
      const page=await client.send(new ListPartsCommand({Bucket,Key:key,UploadId:uploadId,PartNumberMarker:marker,MaxParts:1000}),{abortSignal:AbortSignal.any([deadline,AbortSignal.timeout(8000)])})
      for(const part of page.Parts??[]){
        const n=parts.length+1
        if(n>partCount||part.PartNumber!==n||part.Size!==partBytes(size,partSize,n)||!part.ETag)throw new ServiceUnavailableException('Multipart upload incomplete or invalid')
        parts.push({PartNumber:n,ETag:part.ETag})
      }
      if(!page.IsTruncated)break
      const next=page.NextPartNumberMarker
      if(!next||next===marker||parts.length>=partCount)throw new ServiceUnavailableException('Invalid multipart listing')
      marker=next
    }while(true)
    if(parts.length!==partCount)throw new ServiceUnavailableException('Multipart upload incomplete')
    await client.send(new CompleteMultipartUploadCommand({Bucket,Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts}}),{abortSignal:AbortSignal.any([deadline,AbortSignal.timeout(30000)])})
  }
  async abortMultipart(key:string,uploadId:string){
    const {client,Bucket}=this.ready()
    try{await client.send(new AbortMultipartUploadCommand({Bucket,Key:key,UploadId:uploadId}),{abortSignal:AbortSignal.timeout(8000)})}
    catch(error){if((error as {name?:string}).name!=='NoSuchUpload' && (error as {$metadata?:{httpStatusCode?:number}}).$metadata?.httpStatusCode!==404)throw error}
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
