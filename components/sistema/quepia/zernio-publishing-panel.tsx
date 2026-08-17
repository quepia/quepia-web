"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, CheckCircle2, Crop, ExternalLink, Loader2, Plus, Radio, RefreshCw, Send, Timer } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { defaultZernioMediaEdit, type ZernioMediaEdit } from "@/lib/zernio/media-formats"

const ZernioMediaPreparer = dynamic(
  () => import("@/components/sistema/quepia/zernio-media-preparer").then((module) => module.ZernioMediaPreparer),
  { ssr: false },
)

const CONNECT_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "twitter", label: "X / Twitter" },
  { id: "threads", label: "Threads" },
] as const

type Account = {
  zernio_account_id: string
  platform: string
  username: string | null
  display_name: string | null
  is_active: boolean
  needs_reconnection: boolean
}

type Asset = {
  id: string
  name: string
  assetType: string
  approvalStatus: string
  currentVersion: number
  previewUrl: string | null
  fileType: string | null
  editable: boolean
}

type Publication = {
  id: string
  zernio_post_id: string | null
  status: string
  scheduled_for: string | null
  platform_results: unknown
  error_message: string | null
  created_at: string
}

type PublishingContext = {
  configured: boolean
  canPublish: boolean
  accounts: Account[]
  assets: Asset[]
  publications: Publication[]
  syncError?: string | null
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "Preparando",
  draft: "Borrador",
  scheduled: "Programada",
  publishing: "Publicando",
  published: "Publicada",
  partial: "Publicación parcial",
  failed: "Falló",
  cancelled: "Cancelada",
}

const ASSET_STATUS_LABELS: Record<string, string> = {
  pending_review: "Pendiente de revisión",
  changes_requested: "Con cambios solicitados",
  approved_internal: "Aprobación interna",
  approved_final: "Aprobación final",
  published: "Publicado",
}

function defaultScheduleValue() {
  const date = new Date(Date.now() + 60 * 60 * 1000)
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function findPublicationUrls(value: unknown): string[] {
  const urls = new Set<string>()
  const visit = (item: unknown) => {
    if (!item) return
    if (typeof item === "string" && /^https:\/\//i.test(item)) {
      urls.add(item)
      return
    }
    if (Array.isArray(item)) {
      item.forEach(visit)
      return
    }
    if (typeof item === "object") {
      Object.entries(item as Record<string, unknown>).forEach(([key, child]) => {
        if (/url$/i.test(key)) visit(child)
        else if (typeof child === "object") visit(child)
      })
    }
  }
  visit(value)
  return Array.from(urls)
}

export function ZernioPublishingPanel({
  taskId,
  projectId,
  socialCopy,
  onPublished,
}: {
  taskId: string
  projectId: string
  socialCopy: string
  onPublished?: () => void
}) {
  const [context, setContext] = useState<PublishingContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [content, setContent] = useState(socialCopy)
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([])
  const [selectedAssets, setSelectedAssets] = useState<string[]>([])
  const [mediaEdits, setMediaEdits] = useState<Record<string, ZernioMediaEdit>>({})
  const [preparerOpen, setPreparerOpen] = useState(false)
  const [mode, setMode] = useState<"now" | "schedule">("now")
  const [scheduledFor, setScheduledFor] = useState(defaultScheduleValue)
  const initializedAssetTaskRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/zernio/publish?taskId=${encodeURIComponent(taskId)}`, { cache: "no-store" })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar Zernio")
      const next = data as PublishingContext
      setContext(next)
      setSelectedAccounts((current) => current.filter((id) => next.accounts.some((account) => account.zernio_account_id === id)))
      setMediaEdits((current) => Object.fromEntries(next.assets.map((asset) => [
        asset.id,
        current[asset.id] || defaultZernioMediaEdit(asset.id),
      ])))
      setSelectedAssets((current) => {
        const available = new Set(next.assets.map((asset) => asset.id))
        if (initializedAssetTaskRef.current !== taskId) {
          initializedAssetTaskRef.current = taskId
          return next.assets.map((asset) => asset.id)
        }
        return current.filter((id) => available.has(id))
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Zernio")
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setContent(socialCopy)
  }, [socialCopy])

  const unapprovedSelected = useMemo(
    () => (context?.assets || []).filter((asset) =>
      selectedAssets.includes(asset.id) && !["approved_final", "published"].includes(asset.approvalStatus),
    ),
    [context?.assets, selectedAssets],
  )
  const selectedPreviewAssets = useMemo(
    () => selectedAssets
      .map((assetId) => context?.assets.find((asset) => asset.id === assetId))
      .filter((asset): asset is Asset => Boolean(asset)),
    [context?.assets, selectedAssets],
  )
  const selectedAccountLabel = useMemo(
    () => selectedAccounts
      .map((accountId) => context?.accounts.find((account) => account.zernio_account_id === accountId))
      .filter((account): account is Account => Boolean(account))
      .map((account) => account.display_name || account.username || account.platform)
      .join(" · "),
    [context?.accounts, selectedAccounts],
  )
  const preparedAssetsCount = selectedAssets.filter((assetId) => mediaEdits[assetId]?.format !== "original").length

  const activate = async () => {
    setAction("activate")
    setError("")
    try {
      const response = await fetch("/api/zernio/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo activar Zernio")
      await load()
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "No se pudo activar Zernio")
    } finally {
      setAction(null)
    }
  }

  const connect = async (platform: string) => {
    setAction(platform)
    setError("")
    try {
      const response = await fetch("/api/zernio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, taskId, platform }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.authUrl) throw new Error(data?.error || "No se pudo iniciar la conexión")
      window.location.assign(data.authUrl)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "No se pudo iniciar la conexión")
      setAction(null)
    }
  }

  const publish = async () => {
    const label = mode === "now" ? "publicar ahora" : "programar esta publicación"
    const approvalWarning = unapprovedSelected.length > 0
      ? `\n\n${unapprovedSelected.length} asset(s) no tienen aprobación final. Como administrador podés continuar bajo tu criterio.`
      : ""
    if (!window.confirm(`¿Confirmás que querés ${label} en ${selectedAccounts.length} cuenta(s)?${approvalWarning}`)) return

    setAction("publish")
    setError("")
    setSuccess("")
    try {
      const response = await fetch("/api/zernio/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          content,
          accountIds: selectedAccounts,
          assetIds: selectedAssets,
          mediaEdits: selectedAssets.map((assetId) => mediaEdits[assetId] || defaultZernioMediaEdit(assetId)),
          scheduledFor: mode === "schedule" ? scheduledFor : null,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "Zernio no pudo crear la publicación")
      setSuccess(mode === "now" ? "Publicación enviada a Zernio." : "Publicación programada correctamente.")
      await load()
      onPublished?.()
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Zernio no pudo crear la publicación")
    } finally {
      setAction(null)
    }
  }

  const toggle = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  const reorderSelectedAssets = (orderedIds: string[]) => {
    setSelectedAssets((current) => [
      ...orderedIds.filter((id) => current.includes(id)),
      ...current.filter((id) => !orderedIds.includes(id)),
    ])
  }

  return (
    <div className="mb-6 rounded-xl border border-quepia-cyan/15 bg-quepia-cyan/[0.035] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-quepia-cyan" />
            <h3 className="text-sm font-medium text-white">Publicar con Zernio</h3>
          </div>
          <p className="mt-1 text-[11px] text-white/35">Publicación manual o programada desde esta tarea.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md p-1.5 hover:bg-white/5">
          <RefreshCw className={cn("h-3.5 w-3.5 text-white/40", loading && "animate-spin")} />
        </button>
      </div>

      {loading && !context ? (
        <div className="flex justify-center py-5"><Loader2 className="h-4 w-4 animate-spin text-quepia-cyan" /></div>
      ) : !context ? null
      : !context.canPublish ? (
        <p className="rounded-lg border border-amber-300/10 bg-amber-300/[0.04] p-3 text-xs text-amber-200/70">
          La publicación está reservada a operadores con rol administrador.
        </p>
      ) : !context.configured ? (
        <div className="rounded-lg border border-dashed border-white/10 p-4 text-center">
          <p className="text-xs text-white/50">Primero activá el perfil social de este proyecto.</p>
          <button
            type="button"
            onClick={() => void activate()}
            disabled={action === "activate"}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            {action === "activate" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Activar Zernio
          </button>
        </div>
      ) : context.accounts.length === 0 ? (
        <div>
          <p className="mb-3 text-xs text-white/45">Conectá al menos una cuenta para comenzar.</p>
          <div className="flex flex-wrap gap-2">
            {CONNECT_PLATFORMS.map((platform) => (
              <button
                key={platform.id}
                type="button"
                onClick={() => void connect(platform.id)}
                disabled={Boolean(action)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:border-quepia-cyan/30 hover:text-quepia-cyan disabled:opacity-40"
              >
                {action === platform.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                {platform.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-medium text-white/55">Cuentas de destino</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {context.accounts.map((account) => {
                const unavailable = !account.is_active || account.needs_reconnection
                return (
                  <label key={account.zernio_account_id} className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors",
                    selectedAccounts.includes(account.zernio_account_id)
                      ? "border-quepia-cyan/35 bg-quepia-cyan/[0.07] text-white/85"
                      : "border-white/8 bg-white/[0.02] text-white/50",
                    unavailable && "cursor-not-allowed opacity-45",
                  )}>
                    <input
                      type="checkbox"
                      checked={selectedAccounts.includes(account.zernio_account_id)}
                      disabled={unavailable}
                      onChange={() => toggle(account.zernio_account_id, selectedAccounts, setSelectedAccounts)}
                      className="accent-[#2ae7e4]"
                    />
                    <span className="capitalize">{account.platform}</span>
                    <span className="truncate text-white/30">{account.display_name || account.username}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-white/55">Copy a publicar</p>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={4}
              placeholder="Texto de la publicación"
              className="w-full resize-y rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/25 focus:border-quepia-cyan/40"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white/55">Assets actuales</p>
                <span className="text-[10px] text-white/25">La aprobación del cliente no es obligatoria</span>
              </div>
              {selectedAssets.length > 0 && (
                <button type="button" onClick={() => setPreparerOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-quepia-cyan/25 bg-quepia-cyan/[0.06] px-2.5 py-1.5 text-[11px] text-quepia-cyan hover:bg-quepia-cyan/10">
                  <Crop className="h-3.5 w-3.5" />
                  Previsualizar y preparar
                </button>
              )}
            </div>
            {context.assets.length === 0 ? (
              <p className="rounded-lg border border-white/8 p-3 text-xs text-white/35">No hay assets cargados. Podés publicar texto si la plataforma lo admite.</p>
            ) : (
              <div className="space-y-2">
                {context.assets.map((asset) => {
                  const approved = ["approved_final", "published"].includes(asset.approvalStatus)
                  return (
                    <label key={asset.id} className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                      selectedAssets.includes(asset.id) ? "border-white/15 bg-white/[0.04]" : "border-white/8 text-white/45",
                    )}>
                      <input
                        type="checkbox"
                        checked={selectedAssets.includes(asset.id)}
                        onChange={() => toggle(asset.id, selectedAssets, setSelectedAssets)}
                        className="accent-[#2ae7e4]"
                      />
                      <span className="min-w-0 flex-1 truncate text-white/70">{asset.name} · v{asset.currentVersion}</span>
                      <span className={approved ? "text-emerald-300/70" : "text-amber-300/70"}>
                        {ASSET_STATUS_LABELS[asset.approvalStatus] || asset.approvalStatus}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {unapprovedSelected.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300/10 bg-amber-300/[0.04] p-2.5 text-[11px] text-amber-200/65">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Vas a publicar {unapprovedSelected.length} asset(s) sin aprobación final. Está permitido para administradores y se confirmará antes de enviar.
              </div>
            )}
            {preparedAssetsCount > 0 && (
              <p className="mt-2 text-[11px] text-quepia-cyan/70">{preparedAssetsCount} imagen(es) se enviarán con el recorte preparado. Los originales quedan intactos.</p>
            )}
          </div>

          <div>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setMode("now")}
                className={cn("rounded-lg border px-3 py-1.5 text-xs", mode === "now" ? "border-quepia-cyan/35 bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 text-white/45")}
              >
                Publicar ahora
              </button>
              <button
                type="button"
                onClick={() => setMode("schedule")}
                className={cn("rounded-lg border px-3 py-1.5 text-xs", mode === "schedule" ? "border-quepia-cyan/35 bg-quepia-cyan/10 text-quepia-cyan" : "border-white/10 text-white/45")}
              >
                Programar
              </button>
            </div>
            {mode === "schedule" && (
              <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/10 px-3 py-2">
                <Timer className="h-3.5 w-3.5 text-white/35" />
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                  className="flex-1 bg-transparent text-xs text-white/70 outline-none [color-scheme:dark]"
                />
                <span className="text-[10px] text-white/25">Córdoba</span>
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => void publish()}
            disabled={action === "publish" || selectedAccounts.length === 0 || (!content.trim() && selectedAssets.length === 0) || (mode === "schedule" && !scheduledFor)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {action === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {mode === "now" ? "Publicar ahora" : "Programar publicación"}
          </button>
        </div>
      )}

      {(error || context?.syncError) && (
        <p className="mt-3 rounded-lg border border-red-400/15 bg-red-400/[0.05] p-2.5 text-xs text-red-300">{error || context?.syncError}</p>
      )}
      {success && (
        <p className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] p-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />{success}
        </p>
      )}

      {(context?.publications?.length || 0) > 0 && (
        <div className="mt-4 border-t border-white/8 pt-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/30">Últimos envíos</p>
          <div className="space-y-2">
            {context!.publications.slice(0, 4).map((publication) => {
              const urls = findPublicationUrls(publication.platform_results)
              return (
                <div key={publication.id} className="rounded-lg border border-white/8 bg-black/10 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn(
                      "text-xs",
                      publication.status === "published" ? "text-emerald-300" : publication.status === "failed" ? "text-red-300" : "text-white/60",
                    )}>
                      {STATUS_LABELS[publication.status] || publication.status}
                    </span>
                    <span className="text-[10px] text-white/25">{new Date(publication.created_at).toLocaleString("es-AR")}</span>
                  </div>
                  {publication.error_message && <p className="mt-1 text-[11px] text-red-300/75">{publication.error_message}</p>}
                  {urls.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {urls.slice(0, 4).map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-quepia-cyan hover:underline">
                          Ver publicación {urls.length > 1 ? index + 1 : ""}<ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ZernioMediaPreparer
        open={preparerOpen}
        assets={selectedPreviewAssets}
        content={content}
        accountLabel={selectedAccountLabel}
        edits={mediaEdits}
        onEditChange={(assetId, edit) => setMediaEdits((current) => ({ ...current, [assetId]: edit }))}
        onOrderChange={reorderSelectedAssets}
        onClose={() => setPreparerOpen(false)}
      />
    </div>
  )
}
