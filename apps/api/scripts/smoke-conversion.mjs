import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
const base = process.env.SMOKE_API_URL ?? 'http://localhost:3001/api'
const fixture = process.env.SMOKE_MODEL_PATH
const filename = fixture ? basename(fixture) : 'test.stl'
const file = new Blob([fixture ? await readFile(fixture) : 'solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test\n'], { type: 'application/octet-stream' })
const target = process.env.SMOKE_OUTPUT_FORMAT ?? 'GLB'
const levels = process.env.SMOKE_COMPRESSION ? [process.env.SMOKE_COMPRESSION] : ['GLB', 'STL', 'OBJ', 'PLY', '3MF'].includes(target) ? ['None', 'Low', 'Medium', 'High'] : ['None']
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
assert.equal(new Set(formats.formats.flatMap((format) => format.enabledOutputs)).size, 15)
async function convert(name, blob, compression, outputFormat = target) {
  const session = await api('/jobs/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: name, size: blob.size, outputFormat, compression, color: null }) })
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
    assert.equal(download.filename, 'converted.' + outputFormat.toLowerCase())
    assert.equal(status.outputFormat, outputFormat)
    const head = bytes.subarray(0, 4096).toString('ascii')
    if (outputFormat === 'GLB') {
      assert.equal(bytes.toString('ascii', 0, 4), 'glTF')
      assert.equal(bytes.readUInt32LE(4), 2)
      assert.equal(bytes.readUInt32LE(8), bytes.length)
    } else if (outputFormat === 'STL') {
      assert.ok(bytes.length >= 134)
      assert.equal(bytes.length, 84 + 50 * bytes.readUInt32LE(80))
    } else if (outputFormat === 'GLTF') {
      const document = JSON.parse(bytes.toString('utf8'))
      assert.equal(document.asset.version, '2.0')
      assert.ok(document.buffers.every((buffer) => buffer.uri?.startsWith('data:')))
    } else if (['3MF', 'USDZ'].includes(outputFormat)) assert.equal(bytes.readUInt32LE(0), 0x04034b50)
    else if (outputFormat === 'PLY') assert.ok(head.startsWith('ply'))
    else if (outputFormat === 'FBX') assert.ok(head.startsWith('Kaydara FBX Binary'))
    else if (outputFormat === 'USD' || outputFormat === 'USDC' || outputFormat === 'USDA') assert.ok(head.startsWith('PXR-USDC') || head.startsWith('#usda'))
    else if (outputFormat === 'ABC') assert.ok(head.startsWith('Ogawa') || bytes[0] === 0x89)
    else if (outputFormat === 'BVH') assert.ok(head.trimStart().startsWith('HIERARCHY'))
    else if (outputFormat === 'PDF') assert.ok(head.startsWith('%PDF-'))
    else if (outputFormat === 'SVG') assert.match(head, /<svg\b/)
    else if (outputFormat === 'OBJ') assert.match(bytes.toString('utf8'), /^f\s+/m)
    else assert.fail('Unhandled output type')

    assert.equal(status.outputBytes, bytes.length)
    assert.ok(status.outputBytes <= status.convertedBytes)
    assert.equal(status.compressionApplied, status.outputBytes < status.convertedBytes)
    if (compression === 'None') assert.equal(status.outputBytes, status.convertedBytes)
    if (process.env.SMOKE_REQUIRE_REDUCTION === 'true' && compression !== 'None') assert.equal(status.compressionApplied, true, 'Choose a compressible fixture; compression must actually reduce size')
    console.log('PASS:', name, outputFormat, compression, status.convertedBytes, '→', status.outputBytes, status.warning ?? '')
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
if (original && !fixture && target === 'GLB') {
  const same = await convert('test.glb', new Blob([original], { type: 'application/octet-stream' }), 'None')
  assert.deepEqual(same, original, 'GLB None must preserve original file')
  await convert('test.glb', new Blob([original], { type: 'application/octet-stream' }), 'Medium')
}
