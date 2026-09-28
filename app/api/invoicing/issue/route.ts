import { loadInvoicingConfig } from "@/lib/invoicing/config"
import {
  errorResponse,
  issueResultResponse,
  jsonResponse,
  readIssueRequest,
} from "@/lib/invoicing/http"
import { issueInvoiceForPayment } from "@/lib/invoicing/issue-invoice"
import { firstPartyInvoicingSession } from "@/lib/invoicing/route-auth"

// Emisión desde el panel web. Solo sesión directa de primera parte: un token
// OAuth del MCP usa /api/invoicing/mcp, nunca esta ruta.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: Request) {
  const supabase = await firstPartyInvoicingSession(request, { mutation: false })
  if (supabase instanceof Response) return supabase

  const config = await loadInvoicingConfig(supabase).catch(() => null)
  return jsonResponse(
    {
      ok: true,
      data: config
        ? {
            configured: true,
            environment: config.environment,
            sales_point: config.salesPoint,
            issuer: config.issuer,
          }
        : { configured: false },
    },
    200,
  )
}

export async function POST(request: Request) {
  const supabase = await firstPartyInvoicingSession(request, { mutation: true })
  if (supabase instanceof Response) return supabase

  const body = await readIssueRequest(request)
  if (body instanceof Response) return body

  try {
    return issueResultResponse(await issueInvoiceForPayment(supabase, body))
  } catch (error) {
    console.error(
      "[invoicing] web issue failed",
      error instanceof Error ? error.message : "unknown",
    )
    return errorResponse("INTERNAL_ERROR", "No se pudo emitir la factura.", 500)
  }
}
