import {test} from 'node:test'
import assert from 'node:assert/strict'
import {multipartPlan,partBytes,isUploadSize,PROVIDER_MAX_OBJECT_BYTES} from '../../../packages/shared/src/upload'
test('multipart layout supports large files with bounded part counts',()=>{
  for(const bytes of [1,32*1024**2+1,300*1024**2,1024**3,50*1024**3,PROVIDER_MAX_OBJECT_BYTES]){
    const {partSize,partCount}=multipartPlan(bytes)
    assert.ok(partSize>=16*1024**2&&partCount<=10000)
    assert.ok(partSize<=5*1024**3)
    assert.equal((partCount-1)*partSize+partBytes(bytes,partSize,partCount),bytes)
    assert.throws(()=>partBytes(bytes,partSize,partCount+1))
  }
  for(const invalid of [0,-1,1.5,Infinity,NaN,PROVIDER_MAX_OBJECT_BYTES+1])assert.equal(isUploadSize(invalid),false)
})
