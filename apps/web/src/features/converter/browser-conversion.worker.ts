import { convertBytes } from './mesh-codec'
import type { ModelFormat } from './compatibility'

self.onmessage = async (event: MessageEvent<{ file: File; input: ModelFormat; output: ModelFormat }>) => {
  try {
    const { file, input, output } = event.data
    const blob = convertBytes(await file.arrayBuffer(), input, output)
    self.postMessage({ ok: true, blob })
  } catch {
    self.postMessage({ ok: false, error: 'This file cannot be processed by the lightweight browser converter. You may explicitly choose server processing.' })
  }
}
