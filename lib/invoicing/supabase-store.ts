import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ArcaStore } from "facturas"

const LOCK_TTL_SECONDS = 120
const LOCK_WAIT_MS = 30_000
const LOCK_POLL_MS = 250

type StoreOp = "get" | "set" | "add" | "delete" | "lock" | "unlock"

/**
 * Store durable del SDK `facturas` sobre la RPC accounting_invoice_store.
 * Usa la sesión de quien emite (web o token MCP), así que no hace falta una
 * credencial privilegiada: Postgres vuelve a autorizar cada operación.
 */
export function createSupabaseArcaStore(db: SupabaseClient): ArcaStore {
  async function call(
    op: StoreOp,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { data, error } = await db.rpc("accounting_invoice_store", {
      p_request: { op, ...payload },
    })
    if (error) {
      throw new Error(`ARCA store ${op} failed: ${error.message}`)
    }
    if (!data?.ok) {
      throw new Error(
        `ARCA store ${op} denied: ${data?.error?.code ?? "unknown_error"}`,
      )
    }
    return (data.data ?? {}) as Record<string, unknown>
  }

  return {
    async get(key) {
      const result = await call("get", { key })
      return typeof result.value === "string" ? result.value : null
    },
    async set(key, value) {
      await call("set", { key, value })
    },
    async add(key, value) {
      const result = await call("add", { key, value })
      return result.added === true
    },
    async delete(key) {
      await call("delete", { key })
    },
    // Bloqueo con vencimiento: si el proceso muere, otro lo recupera cuando
    // vence. El TTL supera con margen el límite de tiempo de cada emisión.
    async withLock(key, fn) {
      const owner = crypto.randomUUID()
      const deadline = Date.now() + LOCK_WAIT_MS
      for (;;) {
        const result = await call("lock", {
          key,
          owner,
          ttl_seconds: LOCK_TTL_SECONDS,
        })
        if (result.acquired === true) break
        if (Date.now() > deadline) {
          throw new Error("ARCA store lock timed out")
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS))
      }
      try {
        return await fn()
      } finally {
        await call("unlock", { key, owner }).catch(() => undefined)
      }
    },
  }
}
