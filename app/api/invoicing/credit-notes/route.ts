import {
  creditNoteResultResponse,
  errorResponse,
  readCreditNoteRequest,
} from "@/lib/invoicing/http"
import { issueCreditNote } from "@/lib/invoicing/issue-credit-note"
import { firstPartyInvoicingSession } from "@/lib/invoicing/route-auth"

// Nota de crédito desde el panel web. Solo sesión directa de primera parte.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(request: Request) {
  const supabase = await firstPartyInvoicingSession(request, { mutation: true })
  if (supabase instanceof Response) return supabase

  const body = await readCreditNoteRequest(request)
  if (body instanceof Response) return body

  try {
    return creditNoteResultResponse(await issueCreditNote(supabase, body))
  } catch (error) {
    console.error(
      "[invoicing] web credit note failed",
      error instanceof Error ? error.message : "unknown",
    )
    return errorResponse("INTERNAL_ERROR", "No se pudo emitir la nota de crédito.", 500)
  }
}
