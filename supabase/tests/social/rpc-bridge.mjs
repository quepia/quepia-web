// Puente que ejecuta RPC con argumentos nominales contra PGlite, con la misma
// semántica que supabase.rpc() + socialRpc(): desenvuelve {ok,data,error}.
import { SocialError, statusForCode } from "../../../lib/social/errors.ts"

export function createRpcBridge(db, { role = "service_role" } = {}) {
  const signatures = new Map()
  async function signature(fn) {
    if (!signatures.has(fn)) {
      const { rows } = await db.query(
        `SELECT proargnames AS names, array(SELECT format_type(t, NULL) FROM unnest(proargtypes) AS t) AS types
         FROM pg_proc WHERE proname = $1 AND pronamespace = 'public'::regnamespace`, [fn])
      if (!rows.length) throw new Error(`RPC inexistente: ${fn}`)
      const row = rows[0]
      signatures.set(fn, Object.fromEntries((row.names || []).map((name, index) => [name, row.types[index]])))
    }
    return signatures.get(fn)
  }
  async function raw(fn, args = {}) {
    const types = await signature(fn)
    const keys = Object.keys(args)
    const values = keys.map((key) => {
      const value = args[key]
      const type = types[key]
      if (!type) throw new Error(`Argumento desconocido ${key} para ${fn}`)
      if (value === null || value === undefined) return null
      if (type === "jsonb") return JSON.stringify(value)
      return value
    })
    const call = keys.map((key, index) => `${key} => $${index + 1}::${types[key]}`).join(", ")
    await db.exec(`SET ROLE ${role}`)
    try {
      const { rows } = await db.query(`SELECT public.${fn}(${call}) AS r`, values)
      return rows[0].r
    } finally {
      await db.exec("RESET ROLE")
    }
  }
  async function rpc(fn, args = {}) {
    const data = await raw(fn, args)
    if (data && typeof data === "object" && "ok" in data) {
      if (!data.ok) {
        const code = data.error?.code || "error"
        throw new SocialError(statusForCode(code), code, data.error?.message || "Operación rechazada", data.error?.details)
      }
      return data.data
    }
    return data
  }
  return { rpc, raw }
}
