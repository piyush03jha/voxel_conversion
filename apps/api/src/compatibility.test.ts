import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCEPTED_FORMATS, MAX_UPLOAD_BYTES, getFormatFromFilename, isConversionSupported, CONVERSION_AVAILABLE } from '../../../packages/shared/src/compatibility'

test('file names and upload limit', () => {
  assert.equal(MAX_UPLOAD_BYTES, 200 * 1024 * 1024)
  assert.equal(getFormatFromFilename('example.StL'), 'STL')
  for (const name of ['STL', '.stl', 'model.', 'model.exe', '']) assert.equal(getFormatFromFilename(name), null)
})
test('15 planned GLB pairs and no live conversion', () => {
  assert.equal(ACCEPTED_FORMATS.length, 15)
  assert.equal(ACCEPTED_FORMATS.flatMap((input) => ACCEPTED_FORMATS.filter((output) => isConversionSupported(input, output))).length, 15)
  assert.equal(CONVERSION_AVAILABLE, false)
})
