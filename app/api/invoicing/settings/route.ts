import { errorResponse, jsonResponse } from "@/lib/invoicing/http"
import { firstPartyInvoicingSession } from "@/lib/invoicing/route-auth"
import { InvoicingKeyError } from "@/lib/invoicing/secret-box"
import {
  getSettingsView,
  runSettingsAction,
  SettingsError,
  settingsActionSchema,
} from "@/lib/invoicing/settings-service"
import { utf8ByteLength } from "@/lib/mcp/approval-request"

// Configuración de facturación: solo sesión web directa de un admin. La clave
// privada nunca vuelve al navegador; el servidor la cifra antes de guardarla.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_BODY_BYTES = 64 * 1024

export async function GET(request: Request) {
  const supabase = await firstPartyInvoicingSession(request, { mutation: false })
  if (supabase instanceof Response) return supabase
  try {
    return jsonResponse({ ok: true, data: await getSettingsView(supabase) }, 200)
  } catch (error) {
    if (error instanceof SettingsError) return errorResponse("FORBIDDEN", error.message, 403)
    console.error("[invoicing] settings read failed", error instanceof Error ? error.message : "unknown")
    return errorResponse("INTERNAL_ERROR", "No se pudo leer la configuración.", 500)
  }
}

export async function POST(request: Request) {
  const supabase = await firstPartyInvoicingSession(request, { mutation: true })
  if (supabase instanceof Response) return supabase

  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return errorResponse("UNSUPPORTED_MEDIA_TYPE", "La solicitud requiere JSON.", 415)
  }
  const raw = await request.text().catch(() => "")
  if (utf8ByteLength(raw) > MAX_BODY_BYTES) {
    return errorResponse("PAYLOAD_TOO_LARGE", "La solicitud excede el tamaño permitido.", 413)
  }
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return errorResponse("INVALID_JSON", "El JSON no es válido.", 400)
  }
  const parsed = settingsActionSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return errorResponse("INVALID_REQUEST", issue?.message ?? "Datos inválidos.", 400)
  }

  try {
    const result = await runSettingsAction(supabase, parsed.data)
    return jsonResponse({ ok: true, data: { ...result, settings: await getSettingsView(supabase) } }, 200)
  } catch (error) {
    if (error instanceof SettingsError || error instanceof InvoicingKeyError) {
      return errorResponse("SETTINGS_ERROR", error.message, 422)
    }
    console.error("[invoicing] settings action failed", error instanceof Error ? error.message : "unknown")
    return errorResponse("INTERNAL_ERROR", "No se pudo completar la acción.", 500)
  }
}
