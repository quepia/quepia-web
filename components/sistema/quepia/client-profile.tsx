"use client"

import { useState, useEffect } from "react"
import {
  X,
  User,
  Mail,
  Building2,
  Phone,
  Globe,
  Upload,
  FileText,
  Image as ImageIcon,
  Type,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
  Edit3,
  Save,
  ChevronDown,
  ChevronRight,
  Loader2,
  Share2,
  Copy,
  Plus,
  Trash2,
  Link,
  Send
} from "lucide-react"
import { useClientAccess } from "@/lib/sistema/hooks/useCalendar"
import { generateDirectAccessLink } from "@/app/actions/client-auth"


interface ClientProfileProps {
  projectId: string
  isOpen: boolean
  onClose: () => void
}

interface ClientInfo {
  name: string
  email: string
  company: string
  phone: string
  website: string
}

interface FiscalData {
  cuil_cuit: string
  iva_condition: string
  fiscal_address: string
}

interface BrandFile {
  id: string
  name: string
  type: "logo" | "font" | "brand_guide"
  url: string
  uploaded_at: string
}

interface ApprovalLogEntry {
  id: string
  asset_name: string
  decision: "approved" | "rejected" | "revision_requested"
  notes: string | null
  created_at: string
}

const IVA_CONDITIONS = [
  "Responsable Inscripto",
  "Monotributista",
  "Exento",
  "Consumidor Final",
]

export function ClientProfile({ projectId, isOpen, onClose }: ClientProfileProps) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [clientInfo, setClientInfo] = useState<ClientInfo>({
    name: "",
    email: "",
    company: "",
    phone: "",
    website: "",
  })

  const [fiscalData, setFiscalData] = useState<FiscalData>({
    cuil_cuit: "",
    iva_condition: "",
    fiscal_address: "",
  })

  const [brandFiles, setBrandFiles] = useState<BrandFile[]>([])
  const [approvalLog, setApprovalLog] = useState<ApprovalLogEntry[]>([])

  const [expandedSections, setExpandedSections] = useState({
    info: true,
    brand: true,
    fiscal: false,
    history: false,
    access: false,
  })

  // Add Access Form State
  const [isAddingAccess, setIsAddingAccess] = useState(false)
  const [newAccessName, setNewAccessName] = useState("")
  const [newAccessEmail, setNewAccessEmail] = useState("")
  const [newAccessNotifyDelivery, setNewAccessNotifyDelivery] = useState(true)
  const [newAccessDeliveryEmail, setNewAccessDeliveryEmail] = useState("")
  const [generatingLinkFor, setGeneratingLinkFor] = useState<string | null>(null)
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, string>>({})

  const { clients: accessClients, createClientAccess, updateClientAccess, deleteClientAccess, getShareableLink } = useClientAccess(projectId)

  const normalizeEmail = (value: string) => value.trim().replace(/\u200B/g, "")
  const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))

  useEffect(() => {
    if (isOpen && projectId) {
      fetchClientData()
    }
  }, [isOpen, projectId])

  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleEscape)
    }
  }, [isOpen, onClose])

  const fetchClientData = async () => {
    setLoading(true)
    try {
      // Placeholder data for UI development
      setClientInfo({
        name: "Cliente Demo",
        email: "cliente@ejemplo.com",
        company: "Empresa Demo S.A.",
        phone: "+54 11 1234-5678",
        website: "https://ejemplo.com",
      })
      setFiscalData({
        cuil_cuit: "20-12345678-9",
        iva_condition: "Responsable Inscripto",
        fiscal_address: "Av. Corrientes 1234, CABA",
      })
      setBrandFiles([
        { id: "1", name: "logo-principal.svg", type: "logo", url: "#", uploaded_at: "2025-01-15" },
        { id: "2", name: "manual-marca.pdf", type: "brand_guide", url: "#", uploaded_at: "2025-01-10" },
      ])
      setApprovalLog([
        { id: "1", asset_name: "Banner Hero v3", decision: "approved", notes: "Perfecto, adelante.", created_at: "2025-01-20T14:30:00" },
        { id: "2", asset_name: "Post IG #5", decision: "revision_requested", notes: "Cambiar el color de fondo.", created_at: "2025-01-18T10:00:00" },
        { id: "3", asset_name: "Logo alternativo", decision: "rejected", notes: null, created_at: "2025-01-15T09:00:00" },
      ])
    } catch (error) {
      console.error("Error fetching client data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // TODO: Save to Supabase
      setEditing(false)
    } catch (error) {
      console.error("Error saving client data:", error)
    } finally {
      setSaving(false)
    }
  }

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const decisionIcon = (decision: string) => {
    switch (decision) {
      case "approved":
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case "rejected":
        return <XCircle className="w-4 h-4 text-red-400" />
      case "revision_requested":
        return <MessageSquare className="w-4 h-4 text-yellow-400" />
      default:
        return <Clock className="w-4 h-4 text-white/40" />
    }
  }

  const decisionLabel = (decision: string) => {
    switch (decision) {
      case "approved":
        return "Aprobado"
      case "rejected":
        return "Rechazado"
      case "revision_requested":
        return "Revisión solicitada"
      default:
        return decision
    }
  }

  const fileTypeIcon = (type: string) => {
    switch (type) {
      case "logo":
        return <ImageIcon className="w-4 h-4 text-quepia-cyan" />
      case "font":
        return <Type className="w-4 h-4 text-quepia-cyan" />
      case "brand_guide":
        return <FileText className="w-4 h-4 text-quepia-cyan" />
      default:
        return <FileText className="w-4 h-4 text-white/40" />
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-end p-0 sm:p-3">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar perfil del cliente"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Perfil del Cliente"
        className="relative ml-auto flex h-[100svh] w-full flex-col overflow-hidden border-0 border-white/10 bg-[#0a0a0a] shadow-2xl sm:h-[calc(100svh-1.5rem)] sm:w-[430px] sm:rounded-2xl sm:border"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(42,231,228,0.08),transparent_44%)]"
        />

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0a0a0a]/95 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-quepia-cyan" />
            <h2 className="text-base font-semibold text-white">Perfil del Cliente</h2>
          </div>
          <div className="flex items-center gap-1">
            {editing ? (
              <button
                onClick={handleSave}
                disabled={saving}
                className="p-1.5 rounded-md border border-transparent hover:border-white/10 hover:bg-white/10 text-quepia-cyan transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
              </button>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-md border border-transparent hover:border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md border border-transparent hover:border-white/10 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-[1] flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-quepia-cyan" />
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
            {/* Client Info Section */}
            <div>
              <button
                onClick={() => toggleSection("info")}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Informacion del Cliente
                </span>
                {expandedSections.info ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>
              {expandedSections.info && (
                <div className="px-4 pb-4 space-y-2.5">
                  <FieldRow
                    icon={<User className="w-4 h-4" />}
                    label="Nombre"
                    value={clientInfo.name}
                    editing={editing}
                    onChange={(v) => setClientInfo((p) => ({ ...p, name: v }))}
                  />
                  <FieldRow
                    icon={<Mail className="w-4 h-4" />}
                    label="Email"
                    value={clientInfo.email}
                    editing={editing}
                    onChange={(v) => setClientInfo((p) => ({ ...p, email: v }))}
                  />
                  <FieldRow
                    icon={<Building2 className="w-4 h-4" />}
                    label="Empresa"
                    value={clientInfo.company}
                    editing={editing}
                    onChange={(v) => setClientInfo((p) => ({ ...p, company: v }))}
                  />
                  <FieldRow
                    icon={<Phone className="w-4 h-4" />}
                    label="Telefono"
                    value={clientInfo.phone}
                    editing={editing}
                    onChange={(v) => setClientInfo((p) => ({ ...p, phone: v }))}
                  />
                  <FieldRow
                    icon={<Globe className="w-4 h-4" />}
                    label="Sitio web"
                    value={clientInfo.website}
                    editing={editing}
                    onChange={(v) => setClientInfo((p) => ({ ...p, website: v }))}
                  />
                </div>
              )}
            </div>

            {/* Brand Guide Section */}
            <div>
              <button
                onClick={() => toggleSection("brand")}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Guia de Marca
                </span>
                {expandedSections.brand ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>
              {expandedSections.brand && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex gap-2">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[#1a1a1a] border border-white/10 text-white/70 hover:border-white/20 hover:text-white transition-colors">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Logo
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[#1a1a1a] border border-white/10 text-white/70 hover:border-white/20 hover:text-white transition-colors">
                      <Type className="w-3.5 h-3.5" />
                      Fuente
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[#1a1a1a] border border-white/10 text-white/70 hover:border-white/20 hover:text-white transition-colors">
                      <FileText className="w-3.5 h-3.5" />
                      Manual
                    </button>
                  </div>

                  <div className="bg-[#0d0d0d] border border-dashed border-white/10 rounded-lg p-4 text-center hover:border-quepia-cyan/40 transition-colors cursor-pointer">
                    <Upload className="w-5 h-5 mx-auto mb-2 text-white/30" />
                    <p className="text-xs text-white/40">
                      Arrastra archivos o hace clic para subir
                    </p>
                  </div>

                  {brandFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {brandFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#1a1a1a] border border-white/10"
                        >
                          {fileTypeIcon(file.type)}
                          <span className="flex-1 text-xs text-white/80 truncate">
                            {file.name}
                          </span>
                          <span className="text-[10px] text-white/30">
                            {new Date(file.uploaded_at).toLocaleDateString("es-AR")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Fiscal Data Section */}
            <div>
              <button
                onClick={() => toggleSection("fiscal")}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Datos Fiscales
                </span>
                {expandedSections.fiscal ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>
              {expandedSections.fiscal && (
                <div className="px-4 pb-4 space-y-3">
                  <FieldRow
                    icon={<FileText className="w-4 h-4" />}
                    label="CUIL/CUIT"
                    value={fiscalData.cuil_cuit}
                    editing={editing}
                    onChange={(v) => setFiscalData((p) => ({ ...p, cuil_cuit: v }))}
                  />
                  {editing ? (
                    <div className="space-y-1">
                      <label className="text-[11px] text-white/40">Condicion IVA</label>
                      <select
                        value={fiscalData.iva_condition}
                        onChange={(e) =>
                          setFiscalData((p) => ({ ...p, iva_condition: e.target.value }))
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-md bg-[#1a1a1a] border border-white/10 text-white focus:outline-none focus:border-quepia-cyan/50"
                      >
                        <option value="">Seleccionar...</option>
                        {IVA_CONDITIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <FieldRow
                      icon={<Building2 className="w-4 h-4" />}
                      label="Condicion IVA"
                      value={fiscalData.iva_condition}
                      editing={false}
                      onChange={() => { }}
                    />
                  )}
                  <FieldRow
                    icon={<Globe className="w-4 h-4" />}
                    label="Domicilio fiscal"
                    value={fiscalData.fiscal_address}
                    editing={editing}
                    onChange={(v) => setFiscalData((p) => ({ ...p, fiscal_address: v }))}
                  />
                </div>
              )}
            </div>

            {/* Decision History Timeline */}
            <div>
              <button
                onClick={() => toggleSection("history")}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                  Historial de Decisiones
                </span>
                {expandedSections.history ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>
              {expandedSections.history && (
                <div className="px-4 pb-4">
                  {approvalLog.length === 0 ? (
                    <p className="text-xs text-white/30 text-center py-4">
                      Sin historial de decisiones
                    </p>
                  ) : (
                    <div className="relative space-y-0">
                      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
                      {approvalLog.map((entry) => (
                        <div key={entry.id} className="relative flex gap-3 py-2">
                          <div className="relative z-10 mt-0.5 flex-shrink-0">
                            {decisionIcon(entry.decision)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white/90 truncate">
                              {entry.asset_name}
                            </p>
                            <p className="text-[11px] text-white/50">
                              {decisionLabel(entry.decision)}
                            </p>
                            {entry.notes && (
                              <p className="mt-1 text-[11px] text-white/40 italic">
                                &quot;{entry.notes}&quot;
                              </p>
                            )}
                            <p className="mt-0.5 text-[10px] text-white/25">
                              {new Date(entry.created_at).toLocaleString("es-AR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Client Access Section */}
            <div>
              <button
                onClick={() => toggleSection("access")}
                className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-quepia-cyan/70" />
                  <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Acceso de Cliente
                  </span>
                </div>
                {expandedSections.access ? (
                  <ChevronDown className="w-4 h-4 text-white/40" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/40" />
                )}
              </button>
              {expandedSections.access && (
                <div className="px-4 pb-4 space-y-3">
                  {!isAddingAccess ? (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          setNewAccessName(clientInfo.name || "Cliente")
                          setNewAccessEmail(clientInfo.email || "")
                          setNewAccessNotifyDelivery(true)
                          setNewAccessDeliveryEmail(clientInfo.email || "")
                          setIsAddingAccess(true)
                        }}
                        className="text-[10px] text-quepia-cyan hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Nuevo Acceso
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 space-y-3 mb-4 animate-in fade-in slide-in-from-top-2">
                      <p className="text-xs font-medium text-white">Generar Nuevo Acceso</p>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-white/40 block mb-1">Nombre</label>
                          <input
                            type="text"
                            value={newAccessName}
                            onChange={(e) => setNewAccessName(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-quepia-cyan outline-none"
                            placeholder="Nombre del contacto"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-white/40 block mb-1">Email (para Magic Links)</label>
                          <input
                            type="email"
                            value={newAccessEmail}
                            onChange={(e) => setNewAccessEmail(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-quepia-cyan outline-none"
                            placeholder="cliente@empresa.com"
                          />
                        </div>
                        <div className="rounded-md border border-white/10 bg-white/[0.03] p-2 space-y-2">
                          <label className="flex items-center justify-between gap-2 text-[10px] text-white/75">
                            <span>Notificar por email al subir entregables</span>
                            <DeliveryNotifyToggle
                              enabled={newAccessNotifyDelivery}
                              onToggle={() => setNewAccessNotifyDelivery((prev) => !prev)}
                              ariaLabel="Toggle notificación de entregables"
                            />
                          </label>
                          <div>
                            <label className="text-[10px] text-white/40 block mb-1">Email para notificaciones de entrega</label>
                            <input
                              type="email"
                              value={newAccessDeliveryEmail}
                              onChange={(e) => setNewAccessDeliveryEmail(e.target.value)}
                              disabled={!newAccessNotifyDelivery}
                              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-quepia-cyan outline-none disabled:opacity-45 disabled:cursor-not-allowed"
                              placeholder="entregas@empresa.com"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          onClick={() => {
                            setIsAddingAccess(false)
                            setNewAccessNotifyDelivery(true)
                            setNewAccessDeliveryEmail("")
                          }}
                          className="px-2 py-1 text-xs text-white/50 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={async () => {
                            if (!projectId || !newAccessName) return
                            const normalizedPrimaryEmail = normalizeEmail(newAccessEmail)
                            const normalizedDeliveryEmail = normalizeEmail(newAccessDeliveryEmail)

                            if (newAccessNotifyDelivery) {
                              const candidate = normalizedDeliveryEmail || normalizedPrimaryEmail
                              if (!candidate || !isValidEmail(candidate)) {
                                alert("Ingresá un email válido para notificaciones de entrega.")
                                return
                              }
                            }

                            await createClientAccess({
                              project_id: projectId,
                              nombre: newAccessName,
                              email: normalizedPrimaryEmail,
                              can_view_calendar: true,
                              can_view_tasks: true,
                              can_comment: true,
                              notify_asset_delivery: newAccessNotifyDelivery,
                              delivery_email: newAccessNotifyDelivery
                                ? (normalizedDeliveryEmail || normalizedPrimaryEmail || null)
                                : null,
                            })
                            setIsAddingAccess(false)
                            setNewAccessNotifyDelivery(true)
                            setNewAccessDeliveryEmail("")
                          }}
                          disabled={!newAccessName}
                          className="px-2 py-1 text-xs bg-quepia-cyan text-black rounded font-medium hover:bg-quepia-cyan/90 disabled:opacity-50"
                        >
                          Generar
                        </button>
                      </div>
                    </div>
                  )}

                  {accessClients.length === 0 && !isAddingAccess ? (
                    <div className="text-center py-4 bg-[#0d0d0d] rounded-lg border border-white/10 border-dashed">
                      <p className="text-xs text-white/40 mb-3">No hay accesos generados</p>
                      <button
                        onClick={() => {
                          setNewAccessName(clientInfo.name || "Cliente")
                          setNewAccessEmail(clientInfo.email || "")
                          setNewAccessNotifyDelivery(true)
                          setNewAccessDeliveryEmail(clientInfo.email || "")
                          setIsAddingAccess(true)
                        }}
                        className="px-3 py-1.5 bg-quepia-cyan/10 text-quepia-cyan text-xs rounded-md border border-quepia-cyan/20 hover:bg-quepia-cyan/20 transition-colors flex items-center gap-2 mx-auto"
                      >
                        <Plus className="w-3 h-3" />
                        Crear Primer Acceso
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {accessClients.map(client => {
                        const link = getShareableLink(client.access_token)
                        const isActive = !client.expires_at || new Date(client.expires_at) > new Date()
                        const directLink = generatedLinks[client.id]
                        const isGenerating = generatingLinkFor === client.id
                        const deliveryEmail = client.delivery_email || client.email || ""
                        return (
                          <div key={client.id} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-medium text-white block">{client.nombre}</span>
                                {client.email && <span className="text-[10px] text-white/40 block">{client.email}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}>
                                  {isActive ? "Activo" : "Expirado"}
                                </span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm("¿Estás seguro de eliminar este acceso?")) {
                                      await deleteClientAccess(client.id);
                                    }
                                  }}
                                  className="text-white/20 hover:text-red-400 transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <div className="rounded-md border border-white/10 bg-black/20 p-2.5 space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] text-white/65">Notificar al subir entregables</span>
                                <DeliveryNotifyToggle
                                  enabled={client.notify_asset_delivery}
                                  onToggle={async () => {
                                    const nextNotifyValue = !client.notify_asset_delivery
                                    const fallbackEmail = normalizeEmail(client.delivery_email || client.email || "")
                                    if (nextNotifyValue && (!fallbackEmail || !isValidEmail(fallbackEmail))) {
                                      alert("Este acceso necesita un email válido para activar notificaciones de entrega.")
                                      return
                                    }
                                    const updated = await updateClientAccess(client.id, {
                                      notify_asset_delivery: nextNotifyValue,
                                      delivery_email: fallbackEmail || null,
                                    })
                                    if (!updated) {
                                      alert("No se pudo actualizar la configuración de notificaciones.")
                                    }
                                  }}
                                  ariaLabel="Toggle notificación de entregables"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-white/40 block mb-1">Email para recibir avisos de entrega</label>
                                <input
                                  type="email"
                                  defaultValue={deliveryEmail}
                                  disabled={!client.notify_asset_delivery}
                                  onBlur={async (event) => {
                                    const value = normalizeEmail(event.currentTarget.value)
                                    if (!value) {
                                      await updateClientAccess(client.id, { delivery_email: null })
                                      return
                                    }
                                    if (!isValidEmail(value)) {
                                      alert("Ingresá un email válido.")
                                      event.currentTarget.value = deliveryEmail
                                      return
                                    }
                                    const updated = await updateClientAccess(client.id, { delivery_email: value })
                                    if (!updated) {
                                      alert("No se pudo guardar el email de notificación.")
                                      event.currentTarget.value = deliveryEmail
                                    }
                                  }}
                                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:border-quepia-cyan outline-none disabled:opacity-45 disabled:cursor-not-allowed"
                                  placeholder="entregas@empresa.com"
                                />
                              </div>
                            </div>

                            {/* Direct access link section */}
                            {directLink ? (
                              <div className="space-y-2">
                                <div className="bg-black/30 border border-quepia-cyan/20 rounded px-2 py-1.5">
                                  <div className="flex items-center gap-1 mb-1">
                                    <Link className="w-3 h-3 text-quepia-cyan" />
                                    <span className="text-[10px] text-quepia-cyan font-medium">Link directo generado (30 dias)</span>
                                  </div>
                                  <span className="text-[10px] text-white/50 font-mono block truncate">{directLink}</span>
                                </div>
                                <div className="flex gap-1.5">
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(directLink)
                                      alert("Link copiado al portapapeles")
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded-md bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Copiar
                                  </button>
                                  <button
                                    onClick={() => {
                                      const msg = `Hola ${client.nombre}! Aca tenes tu acceso a la planificacion de tu proyecto en Quepia:\n\n${directLink}\n\nEl link es valido por 30 dias.`
                                      const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`
                                      window.open(waUrl, '_blank')
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded-md bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                                  >
                                    <Send className="w-3 h-3" />
                                    WhatsApp
                                  </button>
                                  <button
                                    onClick={() => {
                                      const subject = encodeURIComponent("Tu acceso a Quepia")
                                      const body = encodeURIComponent(`Hola ${client.nombre},\n\nAca tenes tu link de acceso directo a la planificacion de tu proyecto en Quepia:\n\n${directLink}\n\nEl link es valido por 30 dias.\n\nSaludos,\nQuepia`)
                                      window.open(`mailto:${client.email || ''}?subject=${subject}&body=${body}`, '_blank')
                                    }}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
                                  >
                                    <Mail className="w-3 h-3" />
                                    Email
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {client.email ? (
                                  <div className="flex-1 bg-black/30 border border-white/5 rounded px-2 py-1.5 flex items-center justify-between">
                                    <span className="text-[10px] text-white/40 font-mono truncate">
                                      {typeof window !== 'undefined' ? `${window.location.origin}/cliente/login` : '/cliente/login'}
                                    </span>
                                    <span className="text-[10px] text-quepia-cyan bg-quepia-cyan/10 px-1 rounded ml-2 whitespace-nowrap">
                                      Magic Link
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex-1 bg-black/30 border border-white/5 rounded px-2 py-1.5 truncate text-[10px] text-white/40 font-mono">
                                    {link}
                                  </div>
                                )}

                                <button
                                  onClick={() => {
                                    const url = client.email
                                      ? (typeof window !== 'undefined' ? `${window.location.origin}/cliente/login` : '')
                                      : link

                                    navigator.clipboard.writeText(url)
                                    alert("Enlace copiado")
                                  }}
                                  className="p-1.5 hover:bg-white/10 rounded text-white/60 hover:text-white transition-colors"
                                  title="Copiar"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {/* Generate direct link button */}
                            {!directLink && (
                              <button
                                onClick={async () => {
                                  setGeneratingLinkFor(client.id)
                                  const result = await generateDirectAccessLink(client.id)
                                  if (result.success && result.token) {
                                    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
                                    const fullLink = result.link || `${baseUrl}/cliente/${result.token}`
                                    setGeneratedLinks(prev => ({ ...prev, [client.id]: fullLink }))
                                  } else {
                                    alert(result.error || "Error al generar el link")
                                  }
                                  setGeneratingLinkFor(null)
                                }}
                                disabled={isGenerating}
                                className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[10px] rounded-md bg-quepia-cyan/10 border border-quepia-cyan/20 text-quepia-cyan hover:bg-quepia-cyan/20 transition-colors disabled:opacity-50"
                              >
                                {isGenerating ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Link className="w-3 h-3" />
                                )}
                                {isGenerating ? "Generando..." : "Generar Link Directo"}
                              </button>
                            )}

                            <div className="flex items-center gap-2 text-[10px] text-white/40">
                              <span className={client.can_view_calendar ? "text-quepia-cyan" : ""}>Calendar</span>
                              •
                              <span className={client.can_view_tasks ? "text-quepia-cyan" : ""}>Tareas</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            </div>
          )}
        </div>

        {/* Footer actions */}
        {editing && (
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-white/10 bg-[#0a0a0a]/95 px-4 py-3 backdrop-blur-sm">
            <button
              onClick={() => setEditing(false)}
              className="flex-1 px-3 py-2 text-xs rounded-md bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-2 text-xs rounded-md bg-quepia-cyan text-black font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

function DeliveryNotifyToggle({
  enabled,
  onToggle,
  ariaLabel,
}: {
  enabled: boolean
  onToggle: () => void | Promise<void>
  ariaLabel: string
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span className={`text-[10px] font-medium ${enabled ? "text-quepia-cyan" : "text-white/45"}`}>
        {enabled ? "Activado" : "Desactivado"}
      </span>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-all duration-200 ${enabled
            ? "border-quepia-cyan/60 bg-quepia-cyan/20 shadow-[0_0_0_2px_rgba(34,211,238,0.15)]"
            : "border-white/20 bg-white/10"
          }`}
        aria-label={ariaLabel}
      >
        <span
          className={`absolute left-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white transition-transform duration-200 ${enabled ? "translate-x-5" : "translate-x-0"
            }`}
        >
          {enabled ? (
            <CheckCircle className="h-3 w-3 text-quepia-cyan" />
          ) : (
            <XCircle className="h-3 w-3 text-white/45" />
          )}
        </span>
      </button>
    </div>
  )
}

function FieldRow({
  icon,
  label,
  value,
  editing,
  onChange,
}: {
  icon: React.ReactNode
  label: string
  value: string
  editing: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{label}</label>
      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-white/30">{icon}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs rounded-md bg-[#0f0f0f] border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-quepia-cyan/50"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-white/30">{icon}</span>
          <span className="text-sm text-white/85">{value || "—"}</span>
        </div>
      )}
    </div>
  )
}
