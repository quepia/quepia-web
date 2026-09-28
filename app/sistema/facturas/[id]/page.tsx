import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ComprobanteViewer } from "@/components/sistema/quepia/comprobante-viewer"
import { loadInvoiceDocument } from "@/lib/invoicing/invoice-document"
import { isUuid } from "@/lib/mcp/contracts"
import { createClient } from "@/lib/sistema/supabase/server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Factura | Quepia",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

// Abrir la página completa los datos del Padrón una sola vez; el PDF después
// usa lo guardado.
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const doc = await loadInvoiceDocument(await createClient(), id, { refreshPadron: true })
  if (!doc) notFound()

  return <ComprobanteViewer doc={doc} pdfPath={`/api/invoicing/${id}/pdf`} />
}
