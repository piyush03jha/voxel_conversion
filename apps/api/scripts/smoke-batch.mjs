import assert from 'node:assert/strict'
const base=process.env.SMOKE_API_URL??'http://localhost:3001/api'
async function request(path,body,token,method='POST'){
  const response=await fetch(base+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)})
  return {status:response.status,data:await response.json()}
}
const good={filename:'a.stl',size:134,outputFormat:'GLB',compression:'None'}
const batch=await request('/jobs/batches',{operation:'conversion'})
assert.equal(batch.status,201)
const path='/jobs/batches/'+batch.data.id+'/uploads',token=batch.data.token
let first,second
try{
  assert.equal((await request(path,good,'0'.repeat(64))).status,404)
  assert.equal((await request(path,{...good,compression:'High'},token)).status,400)
  const created=await request(path,good,token);assert.equal(created.status,201);first=created.data
  assert.equal((await request(path,good,token)).status,409)
  assert.equal((await request('/jobs/'+first.id,null,first.token,'DELETE')).status,200)
  const next=await request(path,good,token);assert.equal(next.status,201);second=next.data
  const other=await request('/jobs/batches',{operation:'compression'});assert.equal(other.status,201)
  const compressPath='/jobs/batches/'+other.data.id+'/uploads'
  assert.equal((await request(compressPath,good,other.data.token)).status,400)
  console.log('PASS: owner-only batch admission, separate operations, one outstanding job, next item after cancellation')
}finally{for(const session of [first,second])if(session)await request('/jobs/'+session.id,null,session.token,'DELETE').catch(()=>undefined)}
