import "server-only"
import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { requireSocialAdmin, type SocialAdmin } from "./auth"
import { errorBody, SocialError } from "./errors"
import { utf8ByteLength } from "./policy"
import { socialRpc } from "./rpc"
import { createZernioAdapter } from "./zernio-adapter"
import { createSocialWorker } from "./worker"

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

/** Envuelve un handler admin: valida admin global, origen y normaliza errores. */
export function adminRoute<TContext = unknown>(
  handler: (input: { request: Request; admin: SocialAdmin; context: TContext }) => Promise<unknown>,
) {
  return async (request: Request, context: TContext) => {
    try {
      const admin = await requireSocialAdmin(request)
      const result = await handler({ request, admin, context })
      if (result instanceof Response) return result
      return json(result)
    } catch (error) {
      const { status, body } = errorBody(error)
      return json(body, status)
    }
  }
}

export async function readJson(request: Request, maxBytes = 64_000): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (utf8ByteLength(text) > maxBytes) throw new SocialError(413, "payload_too_large", "Solicitud demasiado grande")
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object")
    return parsed as Record<string, unknown>
  } catch {
    throw new SocialError(400, "invalid_json", "JSON inválido")
  }
}

export function paramsFromUrl(request: Request): Record<string, unknown> {
  const raw = new URL(request.url).searchParams.get("params")
  if (!raw) return {}
  if (raw.length > 8000) throw new SocialError(413, "params_too_large", "Filtros demasiado extensos")
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    throw new SocialError(400, "invalid_params", "Filtros inválidos")
  }
}

export function socialQuery<T = unknown>(admin: SocialAdmin, op: string, params: Record<string, unknown>) {
  return socialRpc<T>("social_query", { p_actor: admin.userId, p_op: op, p_params: params })
}

export function createServerWorker() {
  return createSocialWorker({ rpc: socialRpc, zernio: createZernioAdapter() })
}

export function workerId(prefix: string) {
  return `${prefix}:${process.env.VERCEL_REGION ?? "local"}:${crypto.randomUUID().slice(0, 8)}`
}

/** Comparación en tiempo constante de un secreto de servicio. */
export function hasValidServiceSecret(request: Request, secret: string | undefined) {
  if (!secret) return false
  const header = request.headers.get("authorization") ?? ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : ""
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
