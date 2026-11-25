import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, getFormatFromFilename, isConversionSupported, CONVERSION_AVAILABLE, getSupportedOutputs, getCompressionLevels } from '../../../packages/shared/src/compatibility'

test('file names and upload limit', () => {
  assert.equal(MAX_UPLOAD_BYTES, 200 * 1024 * 1024)
  assert.equal(getFormatFromFilename('example.StL'), 'STL')
  for (const name of ['STL', '.stl', 'model.', 'model.exe', '']) assert.equal(getFormatFromFilename(name), null)
})
test('188 compatible pairs; all 15 outputs represented', () => {
  assert.equal(ACCEPTED_FORMATS.length, 15)
  assert.equal(ACCEPTED_FORMATS.flatMap((input) => ACCEPTED_FORMATS.filter((output) => isConversionSupported(input, output))).length, 188)
  assert.equal(new Set(ACCEPTED_FORMATS.flatMap(getSupportedOutputs)).size, 15)
  assert.equal(isConversionSupported('STL', 'BVH'), false)
  assert.equal(isConversionSupported('FBX', 'BVH'), true)
  assert.equal(isConversionSupported('STL', 'PDF'), false)
  assert.equal(isConversionSupported('PDF', 'SVG'), true)
  assert.deepEqual(getCompressionLevels('FBX'), ['None'])
  assert.deepEqual(getCompressionLevels('STL'), ['None', 'Low', 'Medium', 'High'])
  assert.equal(CONVERSION_AVAILABLE, false)
})
