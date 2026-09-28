import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { isUuid } from "@/lib/mcp/contracts"
import { errorResponse } from "./http"
import type { InvoiceDocument } from "./invoice-document"
import { renderInvoicePdf } from "./invoice-pdf"
import { firstPartyInvoicingSession } from "./route-auth"

/**
 * GET de un PDF de comprobante. ?download=1 lo baja como archivo; sin el
 * parámetro se muestra en el navegador. Usa los datos guardados y nunca
 * consulta ARCA, así responde al instante.
 */
export async function comprobantePdfResponse(
  request: Request,
  id: string,
  load: (db: SupabaseClient, id: string) => Promise<InvoiceDocument | null>,
): Promise<Response> {
  if (!isUuid(id)) {
    return errorResponse("NOT_FOUND", "El comprobante no existe.", 404)
  }

  const supabase = await firstPartyInvoicingSession(request, { mutation: false })
  if (supabase instanceof Response) return supabase

  const doc = await load(supabase, id)
  if (!doc) {
    return errorResponse("NOT_FOUND", "El comprobante no existe o no está autorizado.", 404)
  }

  const pdf = await renderInvoicePdf(doc)
  const download = new URL(request.url).searchParams.get("download") === "1"
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
