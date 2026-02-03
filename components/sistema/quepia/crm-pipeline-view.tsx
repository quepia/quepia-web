"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2, Pencil, ArrowLeft, ArrowRight, Link2, FilePlus, FolderPlus } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useCrmPipeline, useProposals, useProjects } from "@/lib/sistema/hooks"
import type { CrmLead } from "@/types/sistema"
import { createDraftProposalFromLead, createProjectFromLead } from "@/lib/sistema/actions/crm"

interface CrmPipelineViewProps {
  userId?: string
}

export function CrmPipelineView({ userId }: CrmPipelineViewProps) {
  const { stages, leads, loading, createLead, updateLead, deleteLead } = useCrmPipeline()
  const { proposals } = useProposals()
  const { projects } = useProjects(userId)

  const [showNewLead, setShowNewLead] = useState(false)
  const [editingLead, setEditingLead] = useState<CrmLead | null>(null)
  const [form, setForm] = useState({
    company_name: "",
    contact_name: "",
    email: "",
    phone: "",
    service_interest: "",
    estimated_budget: "",
    notes: "",
  })

  const grouped = useMemo(() => {
    const map = new Map<string, CrmLead[]>()
    stages.forEach((stage) => map.set(stage.id, []))
    leads.forEach((lead) => {
      const key = lead.status_id || stages[0]?.id
      if (!key) return
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(lead)
    })
    return map
  }, [stages, leads])

  const resetForm = () => {
    setForm({
      company_name: "",
      contact_name: "",
      email: "",
      phone: "",
      service_interest: "",
      estimated_budget: "",
      notes: "",
    })
    setEditingLead(null)
  }

  const handleSave = async () => {
    if (!form.company_name.trim()) return
    if (editingLead) {
      await updateLead(editingLead.id, {
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        service_interest: form.service_interest || null,
        estimated_budget: form.estimated_budget ? Number(form.estimated_budget) : null,
        notes: form.notes || null,
      })
    } else {
      await createLead({
        company_name: form.company_name,
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        service_interest: form.service_interest || null,
        estimated_budget: form.estimated_budget ? Number(form.estimated_budget) : null,
        status_id: stages[0]?.id,
        owner_id: userId || null,
        notes: form.notes || null,
      })
    }
    resetForm()
    setShowNewLead(false)
  }

  const startEdit = (lead: CrmLead) => {
    setEditingLead(lead)
    setForm({
      company_name: lead.company_name,
      contact_name: lead.contact_name || "",
      email: lead.email || "",
      phone: lead.phone || "",
      service_interest: lead.service_interest || "",
      estimated_budget: lead.estimated_budget?.toString() || "",
      notes: lead.notes || "",
    })
    setShowNewLead(true)
  }

  const moveLead = async (lead: CrmLead, direction: "left" | "right") => {
    const currentIndex = stages.findIndex((s) => s.id === lead.status_id)
    if (currentIndex === -1) return
    const nextIndex = direction === "left" ? currentIndex - 1 : currentIndex + 1
    if (!stages[nextIndex]) return
    await updateLead(lead.id, { status_id: stages[nextIndex].id })
  }

  const handleCreateProject = async (lead: CrmLead) => {
    if (!userId) return
    await createProjectFromLead(lead.id, userId)
  }

  const handleCreateProposal = async (lead: CrmLead) => {
    await createDraftProposalFromLead(lead.id)
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Pipeline CRM</h2>
        <button
          onClick={() => {
            resetForm()
            setShowNewLead(true)
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/20 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo lead
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stages.map((stage) => (
            <div key={stage.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3 min-h-[320px]">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-wider text-white/40">{stage.name}</h3>
                <span className="text-xs text-white/30">{grouped.get(stage.id)?.length || 0}</span>
              </div>
              <div className="space-y-2">
                {(grouped.get(stage.id) || []).map((lead) => (
                  <div key={lead.id} className="bg-white/[0.05] border border-white/10 rounded-lg p-3 space-y-2">
                    <div>
                      <p className="text-sm text-white/90 font-medium">{lead.company_name}</p>
                      <p className="text-xs text-white/40">{lead.contact_name || "Sin contacto"}</p>
                    </div>
                    <div className="text-xs text-white/40">
                      {lead.service_interest || "Sin servicio"}
                    </div>
                    <div className="text-xs text-white/60">
                      {lead.estimated_budget ? `Presupuesto: ${lead.estimated_budget}` : "Sin monto"}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveLead(lead, "left")} className="p-1 rounded hover:bg-white/10">
                        <ArrowLeft className="h-3 w-3 text-white/40" />
                      </button>
                      <button onClick={() => moveLead(lead, "right")} className="p-1 rounded hover:bg-white/10">
                        <ArrowRight className="h-3 w-3 text-white/40" />
                      </button>
                      <button onClick={() => startEdit(lead)} className="p-1 rounded hover:bg-white/10 ml-auto">
                        <Pencil className="h-3 w-3 text-white/40" />
                      </button>
                      <button onClick={() => deleteLead(lead.id)} className="p-1 rounded hover:bg-white/10">
                        <Trash2 className="h-3 w-3 text-red-400" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleCreateProposal(lead)}
                        className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/70 hover:text-white flex items-center gap-1"
                      >
                        <FilePlus className="h-3 w-3" />
                        Crear propuesta
                      </button>
                      <button
                        onClick={() => handleCreateProject(lead)}
                        className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/70 hover:text-white flex items-center gap-1"
                      >
                        <FolderPlus className="h-3 w-3" />
                        Crear proyecto
                      </button>
                      {lead.proposal_id && (
                        <button
                          onClick={() => window.open(`/sistema?view=proposals`, "_blank")}
                          className="text-[10px] px-2 py-1 rounded bg-white/10 text-white/70 hover:text-white flex items-center gap-1"
                        >
                          <Link2 className="h-3 w-3" />
                          Ver propuesta
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowNewLead(false)} />
          <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-xl bg-[#0a0a0a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 sm:p-6 space-y-4">
            <h3 className="text-lg font-semibold text-white">{editingLead ? "Editar lead" : "Nuevo lead"}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} placeholder="Empresa" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.contact_name} onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))} placeholder="Contacto" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="Teléfono" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.service_interest} onChange={(e) => setForm((p) => ({ ...p, service_interest: e.target.value }))} placeholder="Servicio de interés" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <input value={form.estimated_budget} onChange={(e) => setForm((p) => ({ ...p, estimated_budget: e.target.value }))} placeholder="Monto estimado" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notas" className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[120px]" />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setShowNewLead(false)} className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white">Cancelar</button>
              <button onClick={handleSave} className="px-4 py-2 rounded-lg text-sm bg-amber-500/20 text-amber-300 font-semibold hover:bg-amber-500/30">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
