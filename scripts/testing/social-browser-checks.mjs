// Regresiones de UI con navegador real. Requiere el stack sintético y Next
// iniciados con social-local-stack.mjs y social-next-dev.sh. No usa producción.
// SOCIAL_TEST_REAL_AI=1 incluye una consulta Vertex real con datos sintéticos.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync } from "node:fs"
import path from "node:path"

const APP = "http://localhost:3100"
const STACK = "http://localhost:54321"
const SESSION = "social-regressions"
const OUTPUT = path.resolve(process.env.SOCIAL_SCREENSHOTS_DIR || "/tmp/social-regressions")
mkdirSync(OUTPUT, { recursive: true })
const browser = (...args) => execFileSync("npx", ["--yes", "agent-browser@0.38.1", "--session", SESSION, ...args], { encoding: "utf8", timeout: 60_000 }).trim()
const evaluate = (code) => JSON.parse(browser("eval", code))
const wait = (code) => browser("wait", "--fn", code)
const ref = (role, name) => {
  const line = browser("snapshot", "-i").split("\n").find((item) => item.trimStart().startsWith(`- ${role} "${name}`))
  const id = line?.match(/\[ref=(e\d+)\]/)?.[1] || line?.match(/\[ref=(\w+)\]/)?.[1]
  assert.ok(id, `No se encontró ${role}: ${name}`)
  return `@${id}`
}
const click = (name) => browser("click", ref("button", name))
const select = (name, value) => browser("select", ref("combobox", name), value)
const fill = (name, value) => browser("fill", ref("textbox", name), value)
const ok = (name, condition) => { assert.ok(condition, name); console.log(`✔ ${name}`) }
const schema = (enabled) => fetch(`${STACK}/__stack/missing-schema`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) })

// Este endpoint solo existe en el stack de prueba.
assert.ok(Array.isArray(await (await fetch(`${STACK}/__stack/sent`)).json()))
const session = await (await fetch(`${STACK}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "admin@quepia.test", password: "admin-local-123" }),
})).json()
assert.ok(session.access_token)

try {
  browser("open", `${APP}/auth/login`)
  browser("cookies", "set", "sb-localhost-auth-token", `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, "--url", APP, "--path", "/")
  browser("set", "viewport", "1440", "1000")
  browser("open", `${APP}/sistema/social`)
  wait("document.body.innerText.includes('@demo_norte')")

  select("Período", "custom")
  wait("document.querySelectorAll('input[type=date]').length === 2")
  ok("Personalizado abre ambos campos", evaluate("new URLSearchParams(location.search).get('sc_period') === 'custom'"))
  const originalDates = evaluate("[...document.querySelectorAll('input[type=date]')].map(e => e.value)")
  const earlier = new Date(`${originalDates[1]}T12:00:00Z`)
  earlier.setUTCDate(earlier.getUTCDate() - 6)
  browser("fill", "input[type=date] >> nth=0", earlier.toISOString().slice(0, 10))
  wait(`new URLSearchParams(location.search).get('sc_from') === '${earlier.toISOString().slice(0, 10)}'`)
  ok("Un rango de 7 días no cierra el editor personalizado", evaluate("document.querySelectorAll('input[type=date]').length === 2"))
  browser("reload")
  wait("document.querySelectorAll('input[type=date]').length === 2")
  ok("El modo personalizado persiste al recargar", true)
  select("Período", "30")
  wait("document.querySelectorAll('input[type=date]').length === 0")

  click("Bandeja")
  wait("document.body.innerText.includes('Ana (demo)')")
  click("Ana (demo)")
  wait("!!document.querySelector('textarea[placeholder=\"Mensaje directo…\"]')")
  fill("Mensaje directo…", "Borrador exclusivo de Norte")
  select("Cliente", "Cliente Demo Sur")
  wait("document.body.innerText.includes('Sol (demo)') && !document.body.innerText.includes('Ana (demo)')")
  ok("Cambiar de cliente cierra la conversación y el editor anteriores", evaluate("!document.querySelector('textarea') && !document.body.innerText.includes('Responde como @demo_norte')"))
  click("Sol (demo)")
  wait("!!document.querySelector('textarea[placeholder=\"Mensaje directo…\"]')")
  ok("El borrador de Norte no se reutiliza en Sur", evaluate("document.querySelector('textarea').value === ''"))
  fill("Mensaje directo…", "Respuesta sintética de regresión")
  const before = (await (await fetch(`${STACK}/__stack/sent`)).json()).length
  click("Enviar DM")
  wait("document.body.innerText.includes('Respuesta sintética de regresión')")
  const sent = await (await fetch(`${STACK}/__stack/sent`)).json()
  ok("La respuesta sale una sola vez desde la cuenta visible", sent.length === before + 1 && sent.at(-1).accountId === "za_sur")
  browser("screenshot", path.join(OUTPUT, "bandeja-corregida.png"))

  click("Conexiones")
  wait("document.body.innerText.includes('Nuevo cliente')")
  const clientName = `Cliente UI ${Date.now()}`
  fill("Nuevo cliente", clientName)
  click("Crear cliente")
  wait(`document.querySelector('select').innerText.includes('${clientName}')`)
  ok("Crear cliente actualiza el filtro global sin recargar", true)
  select("Cliente", "Todos (agencia)")
  click("Contenido")
  wait("!!document.querySelector('[aria-label=\"Rendimiento por formato\"] table')")
  browser("set", "viewport", "390", "844")
  ok("Tabla móvil con desplazamiento propio y página sin desborde", evaluate("(() => { const e = document.querySelector('[aria-label=\"Rendimiento por formato\"]'); return e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === 'auto' && document.documentElement.scrollWidth === innerWidth })()"))
  const color = evaluate("getComputedStyle(document.querySelector('h1 + p')).color")
  ok("El texto secundario tiene un color legible", color === "rgb(163, 163, 163)")
  browser("screenshot", "--full", path.join(OUTPUT, "contenido-movil-corregido.png"))

  if (process.env.SOCIAL_TEST_REAL_AI === "1") {
    browser("set", "viewport", "1440", "1000")
    select("Cliente", "Cliente Demo Norte")
    click("Análisis con IA")
    wait("!!document.querySelector('textarea')")
    fill("¿Qué querés entender?", "Resumí publicaciones y views del período. Escribí las fechas completas en español y respaldá todo en evidencia.")
    click("Analizar")
    wait("document.body.innerText.includes('completed') || !!document.querySelector('[role=alert]')")
    const result = evaluate("document.body.innerText")
    ok("Análisis real termina y conserva fechas españolas respaldadas", result.includes("completed") && !result.includes("Resumen omitido") && !result.includes("sus cifras (2026"))
    browser("screenshot", "--full", path.join(OUTPUT, "ia-corregida.png"))
  }

  await schema(true)
  browser("open", `${APP}/sistema/social`)
  wait("document.body.innerText.includes('Gestión social: configuración pendiente')")
  ok("Sin migraciones se muestra configuración pendiente y no operaciones", evaluate("!document.body.innerText.includes('Crear cliente') && !document.body.innerText.includes('database_error')"))
  browser("screenshot", path.join(OUTPUT, "configuracion-pendiente.png"))
  console.log("Regresiones de navegador: TODO OK")
} finally {
  await schema(false)
  browser("close")
}
