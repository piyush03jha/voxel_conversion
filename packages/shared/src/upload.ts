// S3-compatible provider protocol limits, not a product-specific upload cap.
export const SINGLE_PUT_THRESHOLD = 32 * 1024 * 1024
export const PROVIDER_MAX_OBJECT_BYTES = 5 * 1024 ** 4
export const MAX_PARTS = 10000
export const PART_URL_BATCH = 16
export function isUploadSize(bytes:unknown):bytes is number {
  return typeof bytes==='number' && Number.isSafeInteger(bytes) && bytes>0 && bytes<=PROVIDER_MAX_OBJECT_BYTES
}
export function multipartPlan(bytes:number){
  if(!isUploadSize(bytes))throw new Error('Invalid object size')
  const mib=1024*1024
  const partSize=Math.max(16*mib,Math.ceil(bytes/MAX_PARTS/mib)*mib)
  return {partSize,partCount:Math.ceil(bytes/partSize)}
}
export function partBytes(bytes:number,partSize:number,part:number){
  if(!Number.isSafeInteger(part)||part<1||part>Math.ceil(bytes/partSize))throw new Error('Invalid part number')
  return Math.min(partSize,bytes-(part-1)*partSize)
}
