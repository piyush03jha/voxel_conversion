import assert from 'node:assert/strict'
const base = process.env.SMOKE_API_URL ?? 'http://localhost:3001/api'
const file = new Blob(['solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n'], { type: 'application/octet-stream' })
async function api(path, options = {}) {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  if (!response.ok) throw Error('API ' + response.status + ': ' + (data.message ?? 'request failed'))
  return data
}
const health = await api('/health')
assert.equal(health.conversionAvailable, true, 'Start worker and enable queue (test mode false)')
const session = await api('/jobs/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'test.stl', size: file.size, outputFormat: 'GLB', compression: 'None', color: null }) })
const auth = { Authorization: 'Bearer ' + session.token }
try {
  const upload = await fetch(session.uploadUrl, { method: 'PUT', headers: session.uploadHeaders, body: file, signal: AbortSignal.timeout(15000) })
  assert.ok(upload.ok, 'upload failed: ' + upload.status)
  await api('/jobs/' + session.id + '/submit', { method: 'POST', headers: auth })
  let status
  for (let i = 0; i < 120; i++) {
    status = await api('/jobs/' + session.id, { headers: auth })
    if (status.status === 'completed') break
    if (['failed', 'expired', 'cancelled'].includes(status.status)) throw Error('Job ' + status.status)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  assert.equal(status?.status, 'completed', 'Job did not complete within smoke-test window')
  const download = await api('/jobs/' + session.id + '/download', { headers: auth })
  const response = await fetch(download.url, { signal: AbortSignal.timeout(15000) })
  assert.ok(response.ok)
  const bytes = Buffer.from(await response.arrayBuffer())
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  assert.equal(status.outputBytes, bytes.length)
  console.log('PASS: signed upload → BullMQ → ADVFX native worker → GLB → signed download')
} finally {
  await fetch(base + '/jobs/' + session.id, { method: 'DELETE', headers: auth, signal: AbortSignal.timeout(5000) }).catch(() => {})
}
