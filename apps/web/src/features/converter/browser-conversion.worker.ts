import { convertBytes } from './mesh-codec'
import type { ModelFormat } from './compatibility'

// App tsconfig uses DOM; this module runs in a dedicated worker, not Window.
const scope = self as unknown as { onmessage: ((event: MessageEvent<{ file: File; input: ModelFormat; output: ModelFormat }>) => void) | null; postMessage: (message: unknown) => void }
scope.onmessage = async (event) => {
  try {
    const { file, input, output } = event.data
    const blob = convertBytes(await file.arrayBuffer(), input, output)
    scope.postMessage({ ok: true, blob })
  } catch {
    scope.postMessage({ ok: false, error: 'This file cannot be processed by the lightweight browser converter. You may explicitly choose server processing.' })
  }
}
