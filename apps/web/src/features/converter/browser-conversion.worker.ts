import { preparePreview } from './preview-codec'
import { convertBytes } from './mesh-codec'
import type { ModelFormat } from './compatibility'

// App tsconfig uses DOM; this module runs in a dedicated worker, not Window.
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ file: File; input: ModelFormat; output: ModelFormat; preview?: boolean }>) => void) | null; postMessage: (message: unknown) => void }
scope.onmessage = async (event) => {
  try {
    const { file, input, output, preview } = event.data
    const bytes = await file.arrayBuffer()
    const blob = preview ? await preparePreview(bytes,input) : convertBytes(bytes, input, output)
    scope.postMessage({ ok: true, blob })
  } catch {
    scope.postMessage({ ok: false, error: 'This file cannot be processed by the lightweight browser converter. You may explicitly choose server processing.' })
  }
}
