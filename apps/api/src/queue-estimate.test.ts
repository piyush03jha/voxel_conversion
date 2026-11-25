import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateWaitSeconds } from './conversion/queue-estimate'

test('estimates start time from actual processing samples and worker occupancy',()=>{
  const samples=[30000,60000,90000]
  assert.equal(estimateWaitSeconds(1,2,samples,[10000,20000]),40)
  assert.equal(estimateWaitSeconds(3,2,samples,[10000,20000]),100)
  assert.equal(estimateWaitSeconds(1,2,samples,[10000]),0)
  assert.equal(estimateWaitSeconds(2,2,samples,[10000]),50)
  assert.equal(estimateWaitSeconds(1,1,samples,[100000]),15)
})
test('no fabricated estimates without samples or workers',()=>{
  assert.equal(estimateWaitSeconds(1,2,[30000,60000],[]),null)
  assert.equal(estimateWaitSeconds(1,0,[1,2,3],[]),null)
  assert.equal(estimateWaitSeconds(1,1,[1,2,3],[1,2]),null)
  assert.equal(estimateWaitSeconds(0,1,[1,2,3],[]),null)
  assert.equal(estimateWaitSeconds(1,1,[0,NaN,Infinity,1],[]),null)
})
