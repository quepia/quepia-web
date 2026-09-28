import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ComprobanteViewer } from "@/components/sistema/quepia/comprobante-viewer"
import { loadCreditNoteDocument } from "@/lib/invoicing/invoice-document"
import { isUuid } from "@/lib/mcp/contracts"
import { createClient } from "@/lib/sistema/supabase/server"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Nota de crédito | Quepia",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
}

export default async function CreditNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()

  const doc = await loadCreditNoteDocument(await createClient(), id, { refreshPadron: true })
  if (!doc) notFound()

  return <ComprobanteViewer doc={doc} pdfPath={`/api/invoicing/credit-notes/${id}/pdf`} />
}
