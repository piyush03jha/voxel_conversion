import assert from 'node:assert/strict'
const base = process.env.SMOKE_API_URL ?? 'http://localhost:3001/api'
const file = new Blob(['solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n'], { type: 'application/octet-stream' })
async function api(path, options = {}) {
  const response = await fetch(base + path, options)
  const json = await response.json()
  if (!response.ok) throw Error('API ' + response.status + ': ' + JSON.stringify(json))
  return json
}
const session = await api('/jobs/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'test.stl', size: file.size, outputFormat: 'GLB' }) })
const headers = { Authorization: 'Bearer ' + session.token }
try {
  const wrong = await fetch(base + '/jobs/' + session.id, { headers: { Authorization: 'Bearer ' + '0'.repeat(64) } })
  assert.equal(wrong.status, 404)
  const put = await fetch(session.uploadUrl, { method: 'PUT', headers: session.uploadHeaders, body: file })
  assert.ok(put.ok, 'signed upload failed: ' + put.status)
  const repeat = await fetch(session.uploadUrl, { method: 'PUT', headers: session.uploadHeaders, body: file })
  assert.equal(repeat.status, 412, 'conditional upload must reject overwrite')
  await api('/jobs/' + session.id + '/submit', { method: 'POST', headers })
  await api('/jobs/' + session.id + '/submit', { method: 'POST', headers })
  const status = await api('/jobs/' + session.id, { headers })
  assert.equal(status.status, 'waiting')
  assert.ok(status.position >= 1)
  assert.equal(status.etaSeconds, null)
  const cancelled = await api('/jobs/' + session.id, { method: 'DELETE', headers })
  assert.equal(cancelled.status, 'cancelled')
  console.log('PASS: direct upload, overwrite prevention, token isolation, idempotent submission, waiting status, cancellation')
} finally {
  await fetch(base + '/jobs/' + session.id, { method: 'DELETE', headers }).catch(() => {})
}
