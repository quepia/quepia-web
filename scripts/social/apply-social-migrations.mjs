// Aplica SOLO las migraciones del módulo social en el proyecto Supabase vía la
// API de administración (queda registrada en el historial remoto). Evita
// `supabase db push`, que con el historial divergente reaplicaría 054–077.
//   node --env-file=.env.local scripts/social/apply-social-migrations.mjs
import { readFileSync, readdirSync } from "node:fs"
const PROJECT = process.env.SUPABASE_PROJECT_REF || "luhbezpflvmevorbayai"
const headers = { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" }
const api = `https://api.supabase.com/v1/projects/${PROJECT}/database/migrations`
const applied = await (await fetch(api, { headers })).json()
const files = readdirSync("supabase/migrations").filter((name) => /^20260918\d+_social_.*\.sql$/.test(name)).sort()
for (const file of files) {
  const name = file.replace(/^\d+_/, "").replace(/\.sql$/, "")
  if (applied.some((item) => item.name === name)) {
    console.log(`= ya aplicada: ${name}`)
    continue
  }
  const response = await fetch(api, { method: "POST", headers, body: JSON.stringify({ name, query: readFileSync(`supabase/migrations/${file}`, "utf8") }) })
  const text = await response.text()
  console.log(`${response.ok ? "✔" : "✖"} ${name} → HTTP ${response.status} ${response.ok ? "" : text.slice(0, 800)}`)
  if (!response.ok) process.exit(1)
}
