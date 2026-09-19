import "server-only"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { SocialError, statusForCode } from "./errors"

type Envelope<T> = { ok: boolean; data: T; error: { code: string; message: string; details?: unknown } | null }

/**
 * Llama una RPC social server-only con service_role y desenvuelve el sobre
 * {ok,data,error}. Las RPC revalidan al administrador en la base: este cliente
 * privilegiado nunca llega al navegador.
 */
export async function socialRpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!/^social_[a-z_]+$/.test(fn)) throw new SocialError(500, "invalid_rpc", "RPC social inválida")
  const admin = createAdminClient()
  const { data, error } = await admin.rpc(fn, args)
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42P01") {
      throw new SocialError(503, "setup_required", "La instalación del módulo social está pendiente en este entorno")
    }
    throw new SocialError(502, "database_error", "La base de datos rechazó la operación social", { rpc: fn, message: error.message })
  }
  if (data && typeof data === "object" && "ok" in (data as Record<string, unknown>)) {
    const envelope = data as Envelope<T>
    if (!envelope.ok) {
      const code = envelope.error?.code || "error"
      throw new SocialError(statusForCode(code), code, envelope.error?.message || "Operación rechazada", envelope.error?.details)
    }
    return envelope.data
  }
  return data as T
}
