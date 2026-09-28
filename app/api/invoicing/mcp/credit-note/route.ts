import {
  creditNoteResultResponse,
  errorResponse,
  readCreditNoteRequest,
} from "@/lib/invoicing/http"
import { issueCreditNote } from "@/lib/invoicing/issue-credit-note"
import { mcpInvoicingClient } from "@/lib/invoicing/route-auth"

// Notas de crédito pedidas por el servicio MCP, con el token del usuario.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await mcpInvoicingClient(request)
  if (supabase instanceof Response) return supabase

  const body = await readCreditNoteRequest(request)
  if (body instanceof Response) return body

  try {
    return creditNoteResultResponse(await issueCreditNote(supabase, body))
  } catch (issueError) {
    console.error(
      "[invoicing] mcp credit note failed",
      issueError instanceof Error ? issueError.message : "unknown",
    )
    return errorResponse("INTERNAL_ERROR", "No se pudo emitir la nota de crédito.", 500)
  }
}
