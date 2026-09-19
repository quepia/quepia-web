import { createServerWorker, hasValidServiceSecret, json, workerId } from "@/lib/social/server"
import { errorBody } from "@/lib/social/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Procesamiento programado del módulo social. Lo invocan el cron de Vercel y
// el workflow programado de GitHub con CRON_SECRET. No requiere abrir pantallas.
async function handle(request: Request) {
  if (!process.env.CRON_SECRET) return json({ error: "CRON_SECRET no configurado" }, 503)
  if (!hasValidServiceSecret(request, process.env.CRON_SECRET)) return json({ error: "No autorizado" }, 401)
  if (!process.env.ZERNIO_API_KEY) return json({ error: "ZERNIO_API_KEY no configurada" }, 503)
  try {
    const result = await createServerWorker().runOnce({ workerId: workerId("scheduled"), budgetMs: 48_000 })
    return json({ ok: true, ...result })
  } catch (error) {
    // Sin migraciones aplicadas responde 503 "setup_required" en vez de 500.
    const { status, body } = errorBody(error)
    return json(body, status)
  }
}

export const GET = handle
export const POST = handle
