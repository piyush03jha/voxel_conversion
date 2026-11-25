import { test } from 'node:test'
import assert from 'node:assert/strict'
import { optimizationArgs } from './process'
import { checkJob } from './contract'
import { verifyGlb } from './storage'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ConversionJobData } from '../../../packages/shared/src/jobs'
const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const good: ConversionJobData = { inputKey: 'temporary/' + id + '/input.stl', outputKey: 'temporary/' + id + '/output.glb', inputFormat: 'STL', outputFormat: 'GLB', originalBytes: 134, compression: 'None', color: null, etag: '"etag"', expiresAt: 2000 }
test('worker rejects unexpected keys, expiry, size and unimplemented options', () => {
  assert.doesNotThrow(() => checkJob(id, good, 1000))
  for (const value of [{ ...good, inputKey: '../etc/passwd' }, { ...good, expiresAt: 999 }, { ...good, originalBytes: 0 }, { ...good, inputFormat: 'OBJ' as const }, { ...good, color: '#000000' }]) assert.throws(() => checkJob(id, value, 1000))
})
test('existing input routing and compression presets', () => {
  for (const format of ['STL', 'OBJ', 'FBX', 'GLB', 'GLTF', '3MF', 'PLY', 'USD', 'USDA', 'USDC', 'USDZ', 'ABC', 'BVH', 'SVG', 'PDF'] as const) {
    assert.doesNotThrow(() => checkJob(id, { ...good, inputFormat: format, inputKey: 'temporary/' + id + '/input.' + format.toLowerCase(), compression: 'High' }, 1000))
  }
  for (const [level, size] of [['Low', '2048'], ['Medium', '1024'], ['High', '512']] as const) {
    const args = optimizationArgs(level, false, 'in.glb', 'out.glb')
    assert.equal(args[args.indexOf('--texture-size') + 1], size)
    assert.equal(args[args.indexOf('--simplify') + 1], level === 'High' ? 'true' : 'false')
    const animated = optimizationArgs(level, true, 'in.glb', 'out.glb')
    assert.equal(animated[animated.indexOf('--simplify') + 1], 'false')
  }
})
test('GLB verification rejects corrupt header', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'formshift-test-'))
  try {
    const file = join(dir, 'bad.glb')
    await writeFile(file, Buffer.alloc(100))
    await assert.rejects(verifyGlb(file, 200))
    await assert.rejects(verifyGlb(file, 50))
  } finally { await rm(dir, { recursive: true, force: true }) }
})
