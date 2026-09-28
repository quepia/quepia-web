import {
  errorResponse,
  issueResultResponse,
  readIssueRequest,
} from "@/lib/invoicing/http"
import { issueInvoiceForPayment } from "@/lib/invoicing/issue-invoice"
import { mcpInvoicingClient } from "@/lib/invoicing/route-auth"

// Emisión de facturas pedida por el servicio MCP, con el token del usuario.
// La clave privada de ARCA nunca sale de este servidor.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await mcpInvoicingClient(request)
  if (supabase instanceof Response) return supabase

  const body = await readIssueRequest(request)
  if (body instanceof Response) return body

  try {
    return issueResultResponse(await issueInvoiceForPayment(supabase, body))
  } catch (issueError) {
    console.error(
      "[invoicing] mcp issue failed",
      issueError instanceof Error ? issueError.message : "unknown",
    )
    return errorResponse("INTERNAL_ERROR", "No se pudo emitir la factura.", 500)
  }
}
