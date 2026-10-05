import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
const source = readFileSync(new URL("./schedule-suggestions.ts", import.meta.url), "utf8").replace('"./publishing-rules"', JSON.stringify(new URL("./publishing-rules.ts", import.meta.url).href))
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { validScheduleSuggestions } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`)

test("horarios IA: convierte Córdoba, descarta pasado, inválidos, duplicados y fuera de vigencia", () => {
  const item = scheduledFor => ({ scheduledFor, reason: "r".repeat(200) })
  const result = validScheduleSuggestions([
    item("2026-10-05T12:00"), item("2026-10-05T12:00"), item("2026-10-04T12:00"),
    item("2026-10-12T12:00"), item("2026-02-30T12:00"), item("2026-10-05T25:00"),
    item("2026-10-05T14:00"), item("2026-10-06T18:00"), item("2026-10-07T18:00"),
  ], Date.parse("2026-10-05T14:00:00Z"), Date.parse("2026-10-11T15:00:00Z"))
  assert.deepEqual(result.map(x => x.scheduledFor), ["2026-10-05T12:00", "2026-10-05T14:00", "2026-10-06T18:00"])
  assert.ok(result.every(x => x.reason.length === 120))
})
