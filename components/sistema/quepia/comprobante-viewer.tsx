import { Download } from "lucide-react"
import type { InvoiceDocument } from "@/lib/invoicing/invoice-document"

// Muestra el mismo PDF que se descarga, así lo que se ve es lo que recibe el
// cliente.
export function ComprobanteViewer({ doc, pdfPath }: { doc: InvoiceDocument; pdfPath: string }) {
  const title = doc.title === "FACTURA" ? "Factura" : "Nota de crédito"
  return (
    <main className="flex h-screen flex-col bg-[#0f0f0f]">
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">
            {title} {doc.voucherClass} {doc.salesPoint}-{doc.number}
            {doc.isTest && <span className="ml-2 text-xs font-normal text-amber-400">Homologación · sin validez fiscal</span>}
          </p>
          <p className="truncate text-xs text-white/50">
            {doc.receiver.name} · $ {doc.amount} · CAE {doc.cae}
            {doc.associated && ` · Corrige ${doc.associated}`}
          </p>
          {doc.warning && (
            <p className="mt-1 text-xs text-amber-400">
              {doc.warning.replace(/\.?$/, ".")} Los datos que falten en el encabezado se vuelven a buscar cuando abras el comprobante pasados 10 minutos.
            </p>
          )}
        </div>
        <a
          href={`${pdfPath}?download=1`}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
        >
          <Download className="h-4 w-4" />
          Descargar PDF
        </a>
      </header>
      <iframe src={pdfPath} title={doc.fileName} className="min-h-0 w-full flex-1 bg-neutral-200" />
    </main>
  )
}
