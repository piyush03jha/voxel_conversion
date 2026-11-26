// Use the existing API TypeScript 5.9 compiler for isolated CommonJS fixtures.
// The web app uses TypeScript 7, whose CLI is not exported at typescript/bin/tsc.
// Resolve the declared executable from package metadata rather than a private subpath.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

export function compileFixtures(temp, sources) {
  const apiRequire = createRequire(new URL('../../api/package.json', import.meta.url))
  let compiler = process.env.FORMSHIFT_TSC
  if (!compiler) {
    let manifest
    try {
      manifest = apiRequire.resolve('typescript/package.json')
    } catch {
      throw new Error('Test compiler unavailable. Run npm run setup from the repository root first.')
    }
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    if (!pkg.bin?.tsc) throw new Error('The API TypeScript package has no tsc executable')
    compiler = resolve(dirname(manifest), pkg.bin.tsc)
  }
  execFileSync(process.execPath, [
    compiler, '--module', 'commonjs', '--moduleResolution', 'node',
    '--target', 'es2022', '--lib', 'ES2022,DOM', '--skipLibCheck', '--strict',
    '--rootDir', resolve('../..'), '--outDir', temp, ...sources,
  ], { stdio: 'inherit' })
}
