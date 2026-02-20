"use client"

import { useMemo, useState } from "react"
import {
  FileText,
  Plus,
  Send,
  Copy,
  Trash2,
  Pencil,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  Link2,
  DollarSign,
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ProjectWithChildren, ProposalCurrency, ProposalStatus } from "@/types/sistema"
import { useProposals, useAllClientAccess, useProposalTemplates } from "@/lib/sistema/hooks"
import { saveProposal, sendProposalEmail, createPaymentFromProposal, saveProposalTemplate } from "@/lib/sistema/actions/proposals"

interface ProposalsViewProps {
  projects: ProjectWithChildren[]
  userId?: string
}

interface SectionDraft {
  temp_id: string
  title: string
  description: string
  moodboard_links: { label: string; url: string }[]
  position: number
}

interface ItemDraft {
  temp_id: string
  section_temp_id: string
  title: string
  description: string
  quantity: number
  unit_price: number
  total_price: number
  position: number
}

const CURRENCIES: ProposalCurrency[] = ["ARS", "USD", "EUR"]

const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  changes_requested: "Cambios solicitados",
  accepted: "Aceptada",
  rejected: "Rechazada",
}

const STATUS_STYLES: Record<ProposalStatus, string> = {
  draft: "text-white/60 bg-white/5",
  sent: "text-cyan-300 bg-cyan-500/10",
  changes_requested: "text-yellow-400 bg-yellow-500/10",
  accepted: "text-green-400 bg-green-500/10",
  rejected: "text-red-400 bg-red-500/10",
}

function flattenProjects(projects: ProjectWithChildren[]): { id: string; nombre: string; color: string }[] {
  const result: { id: string; nombre: string; color: string }[] = []
  const walk = (list: ProjectWithChildren[]) => {
    list.forEach((p) => {
      if (p.icon !== "folder") {
        result.push({ id: p.id, nombre: p.nombre, color: p.color })
      }
      if (p.children?.length) walk(p.children)
    })
  }
  walk(projects)
  return result
}

export function ProposalsView({ projects, userId }: ProposalsViewProps) {
  const { proposals, loading, refresh, fetchProposalDetails, deleteProposal } = useProposals()
  const { clients } = useAllClientAccess()
  const { templates, fetchTemplateDetails } = useProposalTemplates()

  const projectOptions = useMemo(() => flattenProjects(projects), [projects])

  const [filterProject, setFilterProject] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [search, setSearch] = useState("")

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [sourceMode, setSourceMode] = useState<"project" | "client">("project")
  const [form, setForm] = useState({
    title: "",
    summary: "",
    project_id: "",
    client_access_id: "",
    client_name: "",
    client_email: "",
    currency: "ARS" as ProposalCurrency,
    auto_create_payment: false,
  })

  const [sections, setSections] = useState<SectionDraft[]>([])
  const [items, setItems] = useState<ItemDraft[]>([])
  const [status, setStatus] = useState<ProposalStatus>("draft")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("")
  const [templateName, setTemplateName] = useState("")
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiJson, setAiJson] = useState("")
  const [aiInputs, setAiInputs] = useState({
    proyecto: "",
    cliente: "",
    contexto: "",
    objetivos: "",
    funcionalidades: "",
    plazo: "",
    moneda: "USD",
    rango: "",
  })

  const filtered = useMemo(() => {
    return proposals.filter((proposal) => {
      const matchesProject = filterProject === "all" || proposal.project_id === filterProject
      const matchesStatus = filterStatus === "all" || proposal.status === filterStatus
      const term = search.trim().toLowerCase()
      const matchesSearch = !term ||
        proposal.title.toLowerCase().includes(term) ||
        (proposal.client_name || "").toLowerCase().includes(term) ||
        (proposal.client_email || "").toLowerCase().includes(term) ||
        (proposal.project?.nombre || "").toLowerCase().includes(term)
      return matchesProject && matchesStatus && matchesSearch
    })
  }, [proposals, filterProject, filterStatus, search])

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.total_price || 0), 0)
  }, [items])

  const resetForm = () => {
    setEditingId(null)
    setStatus("draft")
    setSourceMode("project")
    setForm({
      title: "",
      summary: "",
      project_id: "",
      client_access_id: "",
      client_name: "",
      client_email: "",
      currency: "ARS",
      auto_create_payment: false,
    })
    setSections([])
    setItems([])
    setSelectedTemplateId("")
    setTemplateName("")
  }

  const openNew = () => {
    resetForm()
    setIsModalOpen(true)
  }

  const openEdit = async (proposalId: string) => {
    const details = await fetchProposalDetails(proposalId)
    if (!details) return

    setEditingId(details.id)
    setStatus(details.status)
    setForm({
      title: details.title,
      summary: details.summary || "",
      project_id: details.project_id || "",
      client_access_id: details.client_access_id || "",
      client_name: details.client_name || "",
      client_email: details.client_email || "",
      currency: details.currency || "ARS",
      auto_create_payment: details.auto_create_payment || false,
    })

    setSections(
      (details.sections || []).map((s, idx) => ({
        temp_id: s.id,
        title: s.title,
        description: s.description || "",
        moodboard_links: s.moodboard_links || [],
        position: idx,
      }))
    )

    setItems(
      (details.items || []).map((i, idx) => ({
        temp_id: i.id,
        section_temp_id: i.section_id || (details.sections?.[0]?.id ?? ""),
        title: i.title,
        description: i.description || "",
        quantity: Number(i.quantity || 0),
        unit_price: Number(i.unit_price || 0),
        total_price: Number(i.total_price || 0),
        position: idx,
      }))
    )

    setIsModalOpen(true)
  }

  const applyTemplate = async () => {
    if (!selectedTemplateId) return
    const template = await fetchTemplateDetails(selectedTemplateId)
    if (!template) return

    setForm((prev) => ({
      ...prev,
      title: prev.title || template.name,
      summary: prev.summary || template.description || "",
      currency: template.currency || prev.currency,
    }))

    setSections(
      (template.sections || []).map((section, idx) => ({
        temp_id: section.id,
        title: section.title,
        description: section.description || "",
        moodboard_links: section.moodboard_links || [],
        position: idx,
      }))
    )

    setItems(
      (template.items || []).map((item, idx) => ({
        temp_id: item.id,
        section_temp_id: item.section_id || (template.sections?.[0]?.id ?? ""),
        title: item.title,
        description: item.description || "",
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0),
        position: idx,
      }))
    )
  }

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return
    await saveProposalTemplate({
      name: templateName.trim(),
      description: form.summary.trim() || null,
      currency: form.currency,
      created_by: userId || null,
      sections: sections.map((section, idx) => ({
        ...section,
        position: idx,
      })),
      items: items.map((item, idx) => ({
        ...item,
        position: idx,
      })),
    })
    setTemplateName("")
  }

  const buildAIPrompt = () => {
    return `Actuá como consultor/a senior de una agencia creativa. Necesito que generes un JSON para una propuesta comercial.\n\nContexto clave:\n- Proyecto: ${aiInputs.proyecto || "[sin definir]"}\n- Cliente: ${aiInputs.cliente || "[sin definir]"}\n- Contexto: ${aiInputs.contexto || "[sin definir]"}\n- Objetivos: ${aiInputs.objetivos || "[sin definir]"}\n- Funcionalidades / Alcance: ${aiInputs.funcionalidades || "[sin definir]"}\n- Plazo estimado: ${aiInputs.plazo || "[sin definir]"}\n- Moneda: ${aiInputs.moneda}\n- Rango de inversión (si aplica): ${aiInputs.rango || "[sin definir]"}\n\nRequisitos:\n- Debe incluir secciones con items y precios realistas según el trabajo.\n- La moneda debe ser ${aiInputs.moneda}.\n- Cada item debe tener quantity y unit_price, y total_price = quantity * unit_price.\n- Incluir resumen claro.\n- Sugerir links de moodboard o referencias por sección cuando aplique.\n\nDevuelve SOLO JSON válido, sin texto extra. Usar este formato:\n{\n  \"title\": \"...\",\n  \"summary\": \"...\",\n  \"currency\": \"ARS|USD|EUR\",\n  \"sections\": [\n    {\n      \"title\": \"...\",\n      \"description\": \"...\",\n      \"moodboard_links\": [\n        { \"label\": \"...\", \"url\": \"https://...\" }\n      ],\n      \"items\": [\n        { \"title\": \"...\", \"description\": \"...\", \"quantity\": 1, \"unit_price\": 1000, \"total_price\": 1000 }\n      ]\n    }\n  ]\n}\n`
  }

  const applyAIJson = () => {
    if (!aiJson.trim()) return
    try {
      const parsed = JSON.parse(aiJson)
      if (!parsed || !parsed.title || !Array.isArray(parsed.sections)) {
        alert("El JSON no tiene el formato esperado.")
        return
      }

      const newSections: SectionDraft[] = []
      const newItems: ItemDraft[] = []

      parsed.sections.forEach((section: any, sectionIndex: number) => {
        const sectionId = crypto.randomUUID()
        newSections.push({
          temp_id: sectionId,
          title: section.title || `Sección ${sectionIndex + 1}`,
          description: section.description || "",
          moodboard_links: Array.isArray(section.moodboard_links)
            ? section.moodboard_links.map((l: any) => ({ label: l.label || "Referencia", url: l.url || "" }))
            : [],
          position: sectionIndex,
        })

        if (Array.isArray(section.items)) {
          section.items.forEach((item: any, itemIndex: number) => {
            const parseNum = (val: any, fallback: number) => {
              if (typeof val === 'number') return val
              if (!val) return fallback
              const stripped = String(val).replace(/[^0-9.-]+/g, '')
              const n = parseFloat(stripped)
              return isNaN(n) ? fallback : n
            }
            const qty = parseNum(item.quantity, 1)
            const unit = parseNum(item.unit_price, 0)
            newItems.push({
              temp_id: crypto.randomUUID(),
              section_temp_id: sectionId,
              title: item.title || `Item ${itemIndex + 1}`,
              description: item.description || "",
              quantity: qty,
              unit_price: unit,
              total_price: Number((qty * unit).toFixed(2)),
              position: newItems.length,
            })
          })
        }
      })

      let finalCurrency = String(parsed.currency || form.currency).toUpperCase().trim()
      if (!['ARS', 'USD', 'EUR'].includes(finalCurrency)) {
        finalCurrency = form.currency
      }

      setForm((prev) => ({
        ...prev,
        title: parsed.title || prev.title,
        summary: parsed.summary || prev.summary,
        currency: finalCurrency as ProposalCurrency,
      }))
      setSections(newSections)
      setItems(newItems)
      setShowAIModal(false)
      setAiJson("")
    } catch (err) {
      alert("No se pudo leer el JSON. Revisá el formato.")
    }
  }

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        temp_id: crypto.randomUUID(),
        title: "Nueva sección",
        description: "",
        moodboard_links: [],
        position: prev.length,
      },
    ])
  }

  const updateSection = (temp_id: string, patch: Partial<SectionDraft>) => {
    setSections((prev) => prev.map((s) => (s.temp_id === temp_id ? { ...s, ...patch } : s)))
  }

  const addMoodboardLink = (temp_id: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.temp_id === temp_id
          ? { ...s, moodboard_links: [...s.moodboard_links, { label: "", url: "" }] }
          : s
      )
    )
  }

  const updateMoodboardLink = (temp_id: string, index: number, patch: { label?: string; url?: string }) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.temp_id !== temp_id) return s
        const nextLinks = s.moodboard_links.map((link, i) => (i === index ? { ...link, ...patch } : link))
        return { ...s, moodboard_links: nextLinks }
      })
    )
  }

  const removeMoodboardLink = (temp_id: string, index: number) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.temp_id !== temp_id) return s
        return { ...s, moodboard_links: s.moodboard_links.filter((_, i) => i !== index) }
      })
    )
  }

  const removeSection = (temp_id: string) => {
    setSections((prev) => prev.filter((s) => s.temp_id !== temp_id))
    setItems((prev) => prev.filter((i) => i.section_temp_id !== temp_id))
  }

  const addItem = (section_temp_id: string) => {
    setItems((prev) => [
      ...prev,
      {
        temp_id: crypto.randomUUID(),
        section_temp_id,
        title: "Nuevo item",
        description: "",
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        position: prev.length,
      },
    ])
  }

  const updateItem = (temp_id: string, patch: Partial<ItemDraft>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.temp_id !== temp_id) return i
        const next = { ...i, ...patch }
        const qty = Number(next.quantity) || 0
        const price = Number(next.unit_price) || 0
        next.total_price = Number((qty * price).toFixed(2))
        return next
      })
    )
  }

  const removeItem = (temp_id: string) => {
    setItems((prev) => prev.filter((i) => i.temp_id !== temp_id))
  }

  const handleClientSelect = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId)
    if (!client) return
    setForm((prev) => ({
      ...prev,
      client_access_id: client.id,
      client_name: client.nombre,
      client_email: client.email,
      project_id: client.project_id || prev.project_id,
    }))
  }

  const handleProjectSelect = (projectId: string) => {
    setForm((prev) => ({
      ...prev,
      project_id: projectId,
    }))
  }

  const save = async () => {
    if (!form.title.trim()) return

    setIsSaving(true)
    try {
      const normalizedSections = sections.map((section, index) => ({
        ...section,
        position: index,
      }))

      const groupedItems = items.map((item, index) => ({
        ...item,
        position: index,
      }))

      const result = await saveProposal({
        proposal: {
          id: editingId || undefined,
          title: form.title.trim(),
          summary: form.summary.trim() || null,
          project_id: form.project_id || null,
          client_access_id: form.client_access_id || null,
          client_name: form.client_name.trim() || null,
          client_email: form.client_email.trim() || null,
          currency: form.currency,
          status,
          total_amount: totalAmount,
          auto_create_payment: form.auto_create_payment,
          created_by: userId || null,
        },
        sections: normalizedSections,
        items: groupedItems,
      })

      if (result.success) {
        await refresh()
        setIsModalOpen(false)
        resetForm()
      } else {
        alert((result.error as any)?.message || result.error || "Ocurrió un error al guardar la propuesta. Revisá que todos los campos sean válidos.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleSend = async (proposalId: string) => {
    await sendProposalEmail(proposalId)
    await refresh()
  }

  const handleCopyLink = (token: string) => {
    const baseUrl = window.location.origin
    const link = `${baseUrl}/propuesta/${token}`
    navigator.clipboard.writeText(link)
  }

  const handleCreatePayment = async (proposalId: string) => {
    await createPaymentFromProposal(proposalId)
    await refresh()
  }

  const handleDelete = async (proposalId: string) => {
    if (!confirm("¿Eliminar esta propuesta?")) return
    await deleteProposal(proposalId)
  }

  const clientsForProject = form.project_id
    ? clients.filter((c) => c.project_id === form.project_id)
    : []

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-quepia-cyan" />
          <h2 className="text-lg font-semibold text-white">Propuestas</h2>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-quepia-cyan text-black text-sm font-semibold hover:bg-quepia-cyan/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nueva propuesta
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, proyecto o título"
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 min-w-[220px]"
        />
        <select
          value={filterProject}
          onChange={(e) => setFilterProject(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos los proyectos</option>
          {projectOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="all">Todos los estados</option>
          {Object.keys(STATUS_LABELS).map((key) => (
            <option key={key} value={key}>{STATUS_LABELS[key as ProposalStatus]}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-6 h-6 border-2 border-quepia-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-white/40">No hay propuestas todavía.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((proposal) => (
            <div key={proposal.id} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-semibold">{proposal.title}</h3>
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full", STATUS_STYLES[proposal.status])}>
                      {STATUS_LABELS[proposal.status]}
                    </span>
                  </div>
                  <p className="text-xs text-white/40">
                    {proposal.client_name || "Sin cliente"} {proposal.client_email ? `• ${proposal.client_email}` : ""}
                  </p>
                  <p className="text-xs text-white/30">
                    {proposal.project?.nombre || "Sin proyecto"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white/60">Total</p>
                  <p className="text-lg font-semibold text-white">{proposal.currency} {Number(proposal.total_amount || 0).toFixed(2)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openEdit(proposal.id)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/[0.08] flex items-center gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  onClick={() => handleSend(proposal.id)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-quepia-cyan/10 text-quepia-cyan hover:bg-quepia-cyan/20 flex items-center gap-1"
                >
                  <Send className="h-3.5 w-3.5" />
                  Enviar
                </button>
                {proposal.public_token && (
                  <button
                    onClick={() => handleCopyLink(proposal.public_token)}
                    className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.05] text-white/60 hover:text-white flex items-center gap-1"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar link
                  </button>
                )}
                {proposal.status === "accepted" && !proposal.accounting_payment_id && (
                  <button
                    onClick={() => handleCreatePayment(proposal.id)}
                    disabled={proposal.currency === "EUR"}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs flex items-center gap-1",
                      proposal.currency === "EUR"
                        ? "bg-white/5 text-white/30 cursor-not-allowed"
                        : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                    )}
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Crear pago
                  </button>
                )}
                <button
                  onClick={() => window.open(`/propuesta/${proposal.public_token}`, "_blank")}
                  className="px-3 py-1.5 rounded-lg text-xs bg-white/[0.05] text-white/60 hover:text-white flex items-center gap-1"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Ver
                </button>
                <button
                  onClick={() => handleDelete(proposal.id)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-5xl bg-[#0a0a0a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{editingId ? "Editar propuesta" : "Nueva propuesta"}</h3>
                <p className="text-xs text-white/40">Estado actual: {STATUS_LABELS[status]}</p>
              </div>
              <div className="flex items-center gap-2">
                {status === "draft" && <Clock className="h-4 w-4 text-white/40" />}
                {status === "sent" && <AlertCircle className="h-4 w-4 text-cyan-300" />}
                {status === "changes_requested" && <AlertCircle className="h-4 w-4 text-yellow-400" />}
                {status === "accepted" && <CheckCircle2 className="h-4 w-4 text-green-400" />}
                {status === "rejected" && <XCircle className="h-4 w-4 text-red-400" />}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Título</label>
                    <input
                      value={form.title}
                      onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                      className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                      placeholder="Ej: Propuesta de Branding" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Resumen</label>
                    <textarea
                      value={form.summary}
                      onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                      className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white min-h-[90px]"
                      placeholder="Descripción breve de la propuesta" />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Plantilla</label>
                    <div className="mt-2 flex gap-2">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                      >
                        <option value="">Seleccionar plantilla</option>
                        {templates.map((template) => (
                          <option key={template.id} value={template.id}>{template.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={applyTemplate}
                        disabled={!selectedTemplateId}
                        className={cn(
                          "px-3 py-2 rounded-lg text-xs",
                          selectedTemplateId ? "bg-quepia-cyan/20 text-quepia-cyan" : "bg-white/5 text-white/30 cursor-not-allowed"
                        )}
                      >
                        Aplicar
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="Guardar como plantilla"
                        className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-xs placeholder:text-white/30"
                      />
                      <button
                        onClick={handleSaveTemplate}
                        className="px-3 py-2 rounded-lg text-xs bg-white/5 text-white/70 hover:text-white"
                      >
                        Guardar
                      </button>
                    </div>
                    <div className="mt-2">
                      <button
                        onClick={() => setShowAIModal(true)}
                        className="w-full px-3 py-2 rounded-lg text-xs bg-white/5 text-white/70 hover:text-white"
                      >
                        Generar con IA (sin API)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Origen</label>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => setSourceMode("project")}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg text-xs",
                          sourceMode === "project" ? "bg-quepia-cyan/20 text-quepia-cyan" : "bg-white/5 text-white/50"
                        )}
                      >
                        Proyecto
                      </button>
                      <button
                        onClick={() => setSourceMode("client")}
                        className={cn(
                          "flex-1 px-3 py-2 rounded-lg text-xs",
                          sourceMode === "client" ? "bg-quepia-cyan/20 text-quepia-cyan" : "bg-white/5 text-white/50"
                        )}
                      >
                        Cliente
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Proyecto</label>
                    <select
                      value={form.project_id}
                      onChange={(e) => handleProjectSelect(e.target.value)}
                      className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Sin proyecto</option>
                      {projectOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Cliente</label>
                    <select
                      value={form.client_access_id}
                      onChange={(e) => handleClientSelect(e.target.value)}
                      className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Seleccionar cliente</option>
                      {(sourceMode === "client" ? clients : clientsForProject).map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.nombre} ({client.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Email</label>
                      <input
                        value={form.client_email}
                        onChange={(e) => setForm((prev) => ({ ...prev, client_email: e.target.value }))}
                        className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="cliente@email.com"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Nombre</label>
                      <input
                        value={form.client_name}
                        onChange={(e) => setForm((prev) => ({ ...prev, client_name: e.target.value }))}
                        className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                        placeholder="Nombre del cliente"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Moneda</label>
                    <select
                      value={form.currency}
                      onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value as ProposalCurrency }))}
                      className="mt-2 w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white"
                    >
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>{currency}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={form.auto_create_payment}
                      onChange={(e) => setForm((prev) => ({ ...prev, auto_create_payment: e.target.checked }))}
                      disabled={form.currency === "EUR"}
                      className="h-4 w-4"
                    />
                    <span className={cn("text-sm", form.currency === "EUR" ? "text-white/30" : "text-white/60")}>
                      Crear pago automáticamente al aceptar
                    </span>
                  </div>
                  {form.currency === "EUR" && (
                    <p className="text-xs text-white/30">Contabilidad aún no soporta EUR para pagos automáticos.</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white">Secciones e items</h4>
                  <button
                    onClick={addSection}
                    className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] text-white/70 hover:text-white"
                  >
                    + Agregar sección
                  </button>
                </div>

                {sections.length === 0 ? (
                  <div className="text-sm text-white/40">Agregá al menos una sección para empezar.</div>
                ) : (
                  <div className="space-y-4">
                    {sections.map((section) => (
                      <div key={section.temp_id} className="border border-white/10 rounded-xl p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 space-y-2">
                            <input
                              value={section.title}
                              onChange={(e) => updateSection(section.temp_id, { title: e.target.value })}
                              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-sm"
                            />
                            <textarea
                              value={section.description}
                              onChange={(e) => updateSection(section.temp_id, { description: e.target.value })}
                              className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-white text-xs min-h-[60px]"
                            />
                          </div>
                          <button
                            onClick={() => removeSection(section.temp_id)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            Eliminar
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-white/40 uppercase tracking-wider">Moodboards / Ejemplos</p>
                            <button
                              onClick={() => addMoodboardLink(section.temp_id)}
                              className="text-xs text-white/50 hover:text-white"
                            >
                              + Agregar link
                            </button>
                          </div>
                          {section.moodboard_links.length === 0 ? (
                            <p className="text-xs text-white/30">No hay links cargados.</p>
                          ) : (
                            <div className="space-y-2">
                              {section.moodboard_links.map((link, index) => (
                                <div key={`${section.temp_id}-${index}`} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_auto] gap-2">
                                  <input
                                    value={link.label}
                                    onChange={(e) => updateMoodboardLink(section.temp_id, index, { label: e.target.value })}
                                    className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                                    placeholder="Etiqueta"
                                  />
                                  <input
                                    value={link.url}
                                    onChange={(e) => updateMoodboardLink(section.temp_id, index, { url: e.target.value })}
                                    className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                                    placeholder="https://..."
                                  />
                                  <button
                                    onClick={() => removeMoodboardLink(section.temp_id, index)}
                                    className="text-xs text-red-400 hover:text-red-300"
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {items.filter((i) => i.section_temp_id === section.temp_id).map((item) => (
                            <div key={item.temp_id} className="grid grid-cols-1 lg:grid-cols-7 gap-2 bg-white/[0.03] border border-white/5 rounded-lg p-3">
                              <input
                                value={item.title}
                                onChange={(e) => updateItem(item.temp_id, { title: e.target.value })}
                                className="lg:col-span-2 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                              />
                              <input
                                value={item.description}
                                onChange={(e) => updateItem(item.temp_id, { description: e.target.value })}
                                className="lg:col-span-2 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                              />
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.temp_id, { quantity: Number(e.target.value) })}
                                className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                              />
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItem(item.temp_id, { unit_price: Number(e.target.value) })}
                                className="bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                              />
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-white/70">{form.currency} {Number(item.total_price || 0).toFixed(2)}</span>
                                <button
                                  onClick={() => removeItem(item.temp_id)}
                                  className="text-xs text-red-400 hover:text-red-300"
                                >
                                  Quitar
                                </button>
                              </div>
                            </div>
                          ))}
                          <button
                            onClick={() => addItem(section.temp_id)}
                            className="text-xs text-white/50 hover:text-white"
                          >
                            + Agregar item
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex items-center justify-between">
              <div className="text-sm text-white/60">
                Total: <span className="text-white font-semibold">{form.currency} {totalAmount.toFixed(2)}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={save}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg text-sm bg-quepia-cyan text-black font-semibold hover:bg-quepia-cyan/90"
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAIModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAIModal(false)} />
          <div className="relative w-full h-[100svh] sm:h-auto sm:max-w-3xl bg-[#0a0a0a] border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl sm:max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">IA para propuestas (sin API)</h3>
              <button onClick={() => setShowAIModal(false)} className="text-white/40 hover:text-white">Cerrar</button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  value={aiInputs.proyecto}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, proyecto: e.target.value }))}
                  placeholder="Proyecto (ej: Web inmobiliaria)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  value={aiInputs.cliente}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, cliente: e.target.value }))}
                  placeholder="Cliente (ej: Inmobiliaria X)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  value={aiInputs.contexto}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, contexto: e.target.value }))}
                  placeholder="Contexto / mercado"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  value={aiInputs.objetivos}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, objetivos: e.target.value }))}
                  placeholder="Objetivos"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  value={aiInputs.funcionalidades}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, funcionalidades: e.target.value }))}
                  placeholder="Funcionalidades / alcance"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <input
                  value={aiInputs.plazo}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, plazo: e.target.value }))}
                  placeholder="Plazo estimado"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
                <select
                  value={aiInputs.moneda}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, moneda: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
                <input
                  value={aiInputs.rango}
                  onChange={(e) => setAiInputs((prev) => ({ ...prev, rango: e.target.value }))}
                  placeholder="Rango de inversión (opcional)"
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-white/40">Prompt sugerido</label>
                <textarea
                  readOnly
                  value={buildAIPrompt()}
                  className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 min-h-[160px]"
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-wider text-white/40">Pegar JSON devuelto por Gemini</label>
                <textarea
                  value={aiJson}
                  onChange={(e) => setAiJson(e.target.value)}
                  className="mt-2 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 min-h-[160px]"
                  placeholder='{"title":"...","summary":"...","currency":"USD","sections":[...] }'
                />
              </div>
            </div>

            <div className="p-5 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={applyAIJson}
                className="px-4 py-2 rounded-lg text-sm bg-quepia-cyan text-black font-semibold hover:bg-quepia-cyan/90"
              >
                Aplicar JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
