import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
const base = process.env.SMOKE_API_URL ?? 'http://localhost:3001/api'
const fixture = process.env.SMOKE_MODEL_PATH
const filename = fixture ? basename(fixture) : 'test.stl'
const file = new Blob([fixture ? await readFile(fixture) : 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n'], { type: 'application/octet-stream' })
const levels = process.env.SMOKE_COMPRESSION ? [process.env.SMOKE_COMPRESSION] : ['None', 'Low', 'Medium', 'High']
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  if (!response.ok) throw Error('API ' + response.status + ': ' + (data.message ?? 'request failed'))
  return data
}
const health = await api('/health')
assert.equal(health.conversionAvailable, true, 'Start worker and enable queue (test mode false)')
const formats = await api('/formats')
assert.equal(formats.formats.filter((format) => format.enabledOutputs.includes('GLB')).length, 15)
assert.deepEqual(formats.compressionLevels, ['None', 'Low', 'Medium', 'High'])
assert.equal(formats.customColorAvailable, false)
async function convert(name, blob, compression) {
  const session = await api('/jobs/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: name, size: blob.size, outputFormat: 'GLB', compression, color: null }) })
  const auth = { Authorization: 'Bearer ' + session.token }
  try {
    const upload = await fetch(session.uploadUrl, { method: 'PUT', headers: session.uploadHeaders, body: blob, signal: AbortSignal.timeout(120000) })
    assert.ok(upload.ok, 'upload failed: ' + upload.status)
    await api('/jobs/' + session.id + '/submit', { method: 'POST', headers: auth })
    let status
    for (let i = 0; i < 660; i++) {
      status = await api('/jobs/' + session.id, { headers: auth })
      if (status.status === 'completed') break
      if (['failed', 'expired', 'cancelled'].includes(status.status)) throw Error('Job ' + status.status)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    assert.equal(status?.status, 'completed', 'Job did not complete within smoke-test window')
    const download = await api('/jobs/' + session.id + '/download', { headers: auth })
    const response = await fetch(download.url, { signal: AbortSignal.timeout(120000) })
    assert.ok(response.ok)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
    assert.equal(bytes.readUInt32LE(4), 2)
    assert.equal(bytes.readUInt32LE(8), bytes.length)
    assert.equal(status.outputBytes, bytes.length)
    assert.ok(status.outputBytes <= status.convertedBytes)
    assert.equal(status.compressionApplied, status.outputBytes < status.convertedBytes)
    if (compression === 'None') assert.equal(status.outputBytes, status.convertedBytes)
    if (process.env.SMOKE_REQUIRE_REDUCTION === 'true' && compression !== 'None') assert.equal(status.compressionApplied, true, 'Choose a compressible fixture; compression must actually reduce size')
    console.log('PASS:', name, compression, status.convertedBytes, '→', status.outputBytes, status.warning ?? '')
    return bytes
  } finally {
    await fetch(base + '/jobs/' + session.id, { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5000) }).catch(() => {})
  }
}
let original
for (const level of levels) {
  const bytes = await convert(filename, file, level)
  if (level === 'None') original = bytes
}
if (original && !fixture) {
  const same = await convert('test.glb', new Blob([original], { type: 'application/octet-stream' }), 'None')
  assert.deepEqual(same, original, 'GLB None must preserve original file')
  await convert('test.glb', new Blob([original], { type: 'application/octet-stream' }), 'Medium')
}
