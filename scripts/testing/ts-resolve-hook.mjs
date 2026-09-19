// Permite que `node --test` importe módulos TypeScript con imports relativos
// sin extensión (convención del repo). Node 24 elimina los tipos de forma
// nativa; este hook solo agrega ".ts" cuando el especificador no la trae.
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(specifier) && context.parentURL) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL)
    if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
  }
  return nextResolve(specifier, context)
}
