import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

// CLI/test bridge to the same server implementation used by Next; no second backup engine.
export function projectModule(entry, overrides = {}) {
  const cache = new Map()
  const root = process.cwd()
  function load(filename) {
    filename = resolve(root, filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const loadedModule = { exports: {} }
    cache.set(filename, loadedModule)
    const nativeRequire = createRequire(filename)
    const localRequire = (id) => {
      if (Object.hasOwn(overrides, id)) return overrides[id]
      if (id.startsWith('@/')) return load(`${id.slice(2)}.ts`)
      if (id.startsWith('.'))
        return load(resolve(dirname(filename), `${id}.ts`))
      return nativeRequire(id)
    }
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    new Function('require', 'module', 'exports', code)(
      localRequire,
      loadedModule,
      loadedModule.exports,
    )
    return loadedModule.exports
  }
  return load(entry)
}
