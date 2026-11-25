import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateUpload, tokenHash } from './conversion/validation'
import { StorageService } from './conversion/storage.service'
import { MAX_UPLOAD_BYTES } from '../../../packages/shared/src/compatibility'

const good = { filename: 'model.stl', size: 100, outputFormat: 'GLB' }
test('metadata validation defaults and maximum size', () => {
  assert.deepEqual(validateUpload(good), { inputFormat: 'STL', originalBytes: 100, outputFormat: 'GLB', compression: 'None', color: null })
  assert.equal(validateUpload({ ...good, size: MAX_UPLOAD_BYTES, compression: 'High' }).compression, 'High')
  assert.throws(() => validateUpload({ ...good, color: '#ABCDEF' }))
  for (const bad of [{ size: 0 }, { size: MAX_UPLOAD_BYTES + 1 }, { size: 1.5 }, { size: '10' }, { filename: '../test.stl' }, { filename: 'test.exe' }, { outputFormat: 'OBJ' }, { color: '#abc' }, { compression: 'Extreme' }, { inputKey: 'arbitrary' }]) assert.throws(() => validateUpload({ ...good, ...bad }))
  assert.throws(() => validateUpload(null))
})
test('bearer token is hashed deterministically', () => {
  assert.equal(tokenHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})
test('presigned upload requires length, content type and conditional write', async () => {
  const keys = ['STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY', 'STORAGE_BUCKET']
  const old = keys.map((key) => process.env[key])
  Object.assign(process.env, { STORAGE_ENDPOINT: 'https://example.invalid', STORAGE_ACCESS_KEY_ID: 'fake-test-key', STORAGE_SECRET_ACCESS_KEY: 'fake-test-secret', STORAGE_BUCKET: 'test' })
  const storage = new StorageService()
  try {
    const url = new URL(await storage.signUpload('temporary/test/input.stl', 100, 60))
    assert.equal(url.searchParams.get('X-Amz-Expires'), '60')
    const headers = url.searchParams.get('X-Amz-SignedHeaders')?.split(';') ?? []
    for (const header of ['content-length', 'content-type', 'if-none-match']) assert.ok(headers.includes(header), header)
  } finally {
    storage.onModuleDestroy()
    keys.forEach((key, i) => { const value = old[i]; if (value === undefined) delete process.env[key]; else process.env[key] = value })
  }
})
