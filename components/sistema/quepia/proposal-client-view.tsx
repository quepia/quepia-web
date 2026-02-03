"use client"

import { useState } from "react"
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Send,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { submitProposalDecision, postProposalComment } from "@/lib/sistema/actions/proposals"

interface ProposalClientViewProps {
  proposal: any
}

export function ProposalClientView({ proposal: initialProposal }: ProposalClientViewProps) {
  const [proposal, setProposal] = useState(initialProposal)
  const [status, setStatus] = useState(initialProposal.status)
  const [comment, setComment] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const sections = proposal.sections || []
  const items = proposal.items || []
  const comments = proposal.comments || []

  const handleDecision = async (decision: "accepted" | "rejected") => {
    if (!confirm(decision === "accepted" ? "¿Aceptar esta propuesta?" : "¿Rechazar esta propuesta?")) return
    setIsSubmitting(true)
    const result = await submitProposalDecision(proposal.public_token, decision)
    if (result.success) {
      setStatus(decision)
      setWarning(result.warning || null)
    }
    setIsSubmitting(false)
  }

  const handleRequestChanges = async () => {
    if (!comment.trim()) return
    setIsSubmitting(true)
    await postProposalComment(proposal.id, comment, proposal.client_name || "Cliente", true)
    const result = await submitProposalDecision(proposal.public_token, "changes_requested")
    if (result.success) {
      setStatus("changes_requested")
      setProposal({
        ...proposal,
        comments: [...comments, {
          id: crypto.randomUUID(),
          content: comment,
          author_name: proposal.client_name || "Cliente",
          created_at: new Date().toISOString(),
        }],
      })
      setComment("")
    }
    setIsSubmitting(false)
  }

  const groupedItems = sections.map((section: any) => ({
    section,
    items: items.filter((item: any) => item.section_id === section.id),
  }))

  const proposalDate = proposal.created_at ? new Date(proposal.created_at) : null
  const formattedDate = proposalDate ? proposalDate.toLocaleDateString("es-AR") : "-"
  const proposalNumber = proposal.proposal_number ? `#${proposal.proposal_number}` : proposal.id?.slice(0, 8)

  return (
    <div className="relative min-h-screen bg-[#070707] text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(42,231,228,0.18),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_rgba(136,16,120,0.2),_transparent_55%)]" />
        <div className="absolute -top-32 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-quepia-cyan/20 blur-[180px]" />
        <div className="absolute top-10 right-10 h-[360px] w-[360px] rounded-full bg-quepia-magenta/22 blur-[180px]" />
        <div className="absolute bottom-0 left-10 h-[300px] w-[300px] rounded-full bg-white/10 blur-[200px]" />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-10 md:pt-28 relative">
        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_0.7fr] gap-8">
          <div className="space-y-8">
            <div className="rounded-3xl border border-white/15 bg-[#0c0c0c]/80 backdrop-blur-3xl p-6 md:p-10 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-transparent pointer-events-none" />
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center backdrop-blur-2xl overflow-hidden">
                    <img src="/Logo_Quepia.svg" alt="Quepia" className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-white/40">Quepia Consultora</p>
                    <p className="text-sm text-white/70">hola@quepia.com</p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">Presupuesto</span>
                  <span className="text-sm text-white/70">{proposalNumber}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 rounded-full bg-quepia-cyan/10 text-quepia-cyan text-xs font-medium border border-quepia-cyan/20">
                    {proposal.project?.nombre || "Propuesta"}
                  </div>
                  {status === "sent" && (
                    <span className="text-sm text-cyan-300 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Enviada</span>
                  )}
                  {status === "accepted" && (
                    <span className="text-sm text-green-500 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Aceptada</span>
                  )}
                  {status === "changes_requested" && (
                    <span className="text-sm text-yellow-400 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Cambios solicitados</span>
                  )}
                  {status === "rejected" && (
                    <span className="text-sm text-red-500 flex items-center gap-1"><XCircle className="w-4 h-4" /> Rechazada</span>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl md:text-5xl font-light leading-tight">
                  {proposal.title}
                </h1>
                {proposal.summary && (
                  <p className="text-white/60 text-base md:text-lg leading-relaxed max-w-2xl">
                    {proposal.summary}
                  </p>
                )}
              </div>

              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#0c0c0c]/75 border border-white/15 rounded-2xl p-4 backdrop-blur-3xl">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Cliente</p>
                  <p className="text-sm text-white/80 mt-2 break-words">{proposal.client_name || "Cliente"}</p>
                  <p className="text-xs text-white/40 break-words">{proposal.client_email || "—"}</p>
                </div>
                <div className="bg-[#0c0c0c]/75 border border-white/15 rounded-2xl p-4 backdrop-blur-3xl">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Fecha</p>
                  <p className="text-sm text-white/80 mt-2">{formattedDate}</p>
                  <p className="text-xs text-white/40">Validez: 30 días</p>
                </div>
                <div className="bg-[#0c0c0c]/75 border border-white/15 rounded-2xl p-4 backdrop-blur-3xl">
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">Moneda</p>
                  <p className="text-sm text-white/80 mt-2">{proposal.currency}</p>
                  <p className="text-xs text-white/40">Total: {proposal.currency} {Number(proposal.total_amount || 0).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {groupedItems.map(({ section, items: sectionItems }: any) => (
                <div key={section.id} className="bg-[#0c0c0c]/75 border border-white/15 rounded-3xl p-6 md:p-8 backdrop-blur-3xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg md:text-xl font-semibold text-white">{section.title}</h3>
                    <span className="text-xs text-white/40 uppercase tracking-[0.3em]">Alcance</span>
                  </div>
                  {section.description && (
                    <p className="text-sm text-white/50 mb-5">{section.description}</p>
                  )}
                  {section.moodboard_links && section.moodboard_links.length > 0 && (
                    <div className="mb-5">
                      <p className="text-xs uppercase tracking-[0.3em] text-white/40 mb-3">Moodboard / Referencias</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {section.moodboard_links.map((link: any, index: number) => (
                          <a
                            key={`${section.id}-${index}`}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group border border-white/15 rounded-2xl p-4 bg-black/60 backdrop-blur-2xl hover:bg-white/10 transition-colors"
                          >
                            <p className="text-sm text-white/80 font-medium">
                              {link.label || "Referencia"}
                            </p>
                          <p className="text-xs text-white/40 mt-1 break-words">{link.url}</p>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                  <div className="space-y-3">
                    {sectionItems.map((item: any) => (
                      <div key={item.id} className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-3 border border-white/15 rounded-2xl px-4 py-3 bg-black/70 backdrop-blur-2xl">
                        <div>
                          <p className="text-sm text-white/90 font-medium">{item.title}</p>
                          {item.description && <p className="text-xs text-white/40 mt-1">{item.description}</p>}
                        </div>
                        <div className="text-sm text-white/70 md:text-right flex flex-col gap-1">
                          <span className="text-xs text-white/40">Cantidad {item.quantity}</span>
                          <span>{proposal.currency} {Number(item.unit_price || 0).toFixed(2)} c/u</span>
                          <span className="text-white font-semibold">{proposal.currency} {Number(item.total_price || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-quepia-cyan/25 to-quepia-magenta/25 border border-white/15 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 backdrop-blur-3xl">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-white/50">Total final</p>
                <p className="text-3xl font-semibold">{proposal.currency} {Number(proposal.total_amount || 0).toFixed(2)}</p>
              </div>
              <div className="flex items-center gap-3 text-white/60 text-sm">
                <FileText className="w-5 h-5 text-quepia-cyan" />
                Documento digital de propuesta
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-white/15 bg-[#0c0c0c]/80 p-6 backdrop-blur-3xl">
              <h2 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-4">Forma de pago</h2>
              <div className="grid grid-cols-2 gap-2 text-sm text-white/70">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded border border-white/20" />
                  Transferencia
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded border border-white/20" />
                  Contado
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded border border-white/20" />
                  Otro
                </div>
                <div className="text-xs text-white/30">A definir con el cliente</div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-[#0c0c0c]/80 p-6 backdrop-blur-3xl">
              <h2 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-4">Tu decisión</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => handleDecision("accepted")}
                  disabled={isSubmitting || status === "accepted"}
                  className={cn(
                    "h-12 rounded-xl border border-green-500/20 text-green-500 bg-green-500/10 transition-all",
                    status === "accepted" && "bg-green-500 text-black"
                  )}
                >
                  <CheckCircle2 className="inline-block mr-2 w-5 h-5" />
                  Aceptar
                </button>
                <button
                  onClick={() => handleDecision("rejected")}
                  disabled={isSubmitting || status === "rejected"}
                  className={cn(
                    "h-12 rounded-xl border border-red-500/20 text-red-500 bg-red-500/10 transition-all",
                    status === "rejected" && "bg-red-500 text-white"
                  )}
                >
                  <XCircle className="inline-block mr-2 w-5 h-5" />
                  Rechazar
                </button>
              </div>
              {warning && (
                <p className="text-xs text-yellow-400 mt-3">{warning}</p>
              )}
            </div>

            <div className="rounded-3xl border border-white/15 bg-[#0c0c0c]/80 p-6 flex flex-col gap-4 backdrop-blur-3xl">
              <div>
                <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-3">Comentarios</h3>
                {comments.length === 0 ? (
                  <div className="text-sm text-white/30">Sin comentarios todavía.</div>
                ) : (
                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                    {comments.map((c: any) => (
                      <div key={c.id} className="bg-white/5 border border-white/10 rounded-lg p-3">
                        <p className="text-xs text-white/50">{c.author_name}</p>
                        <p className="text-sm text-white/80 mt-1 whitespace-pre-wrap">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.3em] text-white/50 mb-3">Solicitar cambios</h3>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white text-sm min-h-[120px]"
                  placeholder="Escribí los cambios que necesitás"
                />
                <button
                  onClick={handleRequestChanges}
                  disabled={isSubmitting || !comment.trim()}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-quepia-cyan text-black font-semibold"
                >
                  <Send className="w-4 h-4" />
                  Enviar cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
