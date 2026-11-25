// Local-only bootstrap; never use these credentials or this container in production.
import { S3Client, HeadBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
const Bucket = process.env.STORAGE_BUCKET
const endpoint = process.env.STORAGE_ENDPOINT
const origins = process.env.WEB_ORIGINS.split(',')
const client = new S3Client({
  endpoint, region: process.env.STORAGE_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 1,
})
const send = command => client.send(command, { abortSignal: AbortSignal.timeout(10000) })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const key = 'temporary/bootstrap-' + randomUUID()
const copyKey = key + '-copy'
try {
  let ready = false
  const until = Date.now() + 120000
  while (Date.now() < until) {
    try { await send(new HeadBucketCommand({ Bucket })); ready = true; break }
    catch { await wait(2000) }
  }
  if (!ready) throw new Error('Local S3 bucket did not become ready within 120 seconds')
  await send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{
    AllowedOrigins: origins, AllowedMethods: ['PUT','GET','HEAD'], AllowedHeaders: ['Content-Type','If-None-Match','Content-Length'],
    ExposeHeaders: ['ETag','Content-Length'], MaxAgeSeconds: 300,
  }] } }))
  await send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [{
    ID: 'expire-temporary', Status: 'Enabled', Filter: { Prefix: 'temporary/' }, Expiration: { Days: 2 },
  }] } }))
  // Match the API's signed PUT contract. Do not weaken it to make a local provider work.
  const data = Buffer.from('local storage probe')
  const headers = { 'Content-Type': 'application/octet-stream', 'If-None-Match': '*' }
  const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key:key, ContentType:headers['Content-Type'], ContentLength:data.length, IfNoneMatch:'*' }), {
    expiresIn: 60, signableHeaders: new Set(['content-length','content-type','if-none-match']),
  })
  const signed = new URL(url).searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
  assert.ok(['content-length','content-type','if-none-match'].every(h=>signed.includes(h)), 'Required upload headers are not signed')
  const preflight = await fetch(url,{method:'OPTIONS',headers:{Origin:origins[0],'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,if-none-match'},signal:AbortSignal.timeout(10000)})
  assert.ok(preflight.ok,'Storage CORS preflight rejected')
  assert.ok([origins[0],'*'].includes(preflight.headers.get('access-control-allow-origin')),'Storage CORS origin not allowed')
  const put = body => fetch(url,{method:'PUT',headers,body,signal:AbortSignal.timeout(10000)})
  const wrong = await put(Buffer.from('short'))
  await wrong.body?.cancel()
  assert.ok(!wrong.ok,'Storage failed to enforce signed content length')
  const first = await put(data)
  await first.body?.cancel()
  assert.ok(first.ok,'Storage signed PUT failed: '+first.status)
  const second = await put(data)
  await second.body?.cancel()
  assert.equal(second.status,412,'Storage failed to reject an overwrite')
  const object=await send(new HeadObjectCommand({Bucket,Key:key}))
  assert.equal(object.ContentLength,data.length)
  assert.ok(object.ETag)
  const fetched=await send(new GetObjectCommand({Bucket,Key:key,IfMatch:object.ETag}))
  assert.deepEqual(Buffer.from(await fetched.Body.transformToByteArray()),data)
  await send(new CopyObjectCommand({Bucket,Key:copyKey,CopySource:Bucket+'/'+key,CopySourceIfMatch:object.ETag}))
  const copied=await send(new HeadObjectCommand({Bucket,Key:copyKey}))
  assert.equal(copied.ContentLength,data.length)
  console.log('Local S3 ready: bucket, CORS, lifecycle, signed upload, conditional write, read and copy checks passed.')
} catch(error) {
  console.error('Local S3 initialization failed:',error instanceof Error?error.message:'unknown error')
  process.exitCode=1
} finally {
  for(const Key of [key,copyKey])await send(new DeleteObjectCommand({Bucket,Key})).catch(()=>undefined)
  client.destroy()
}
