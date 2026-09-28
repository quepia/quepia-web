import { loadInvoiceDocument } from "@/lib/invoicing/invoice-document"
import { comprobantePdfResponse } from "@/lib/invoicing/pdf-route"

// PDF de una factura, en el formato de Comprobantes en línea.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  return comprobantePdfResponse(request, id, (db, invoiceId) => loadInvoiceDocument(db, invoiceId))
}
