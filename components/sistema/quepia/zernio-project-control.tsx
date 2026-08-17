"use client"

import { useCallback, useState } from "react"
import { CheckCircle2, Loader2, Plus, Radio, RefreshCw, Unplug, X } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "twitter", label: "X / Twitter" },
  { id: "threads", label: "Threads" },
] as const

type ZernioAccount = {
  id: string
  zernio_account_id: string
  platform: string
  username: string | null
  display_name: string | null
  is_active: boolean
  needs_reconnection: boolean
}

type ProjectState = {
  configured: boolean
  canManage: boolean
  accounts: ZernioAccount[]
  syncError?: string | null
  profile?: {
    name: string
    status: string
    lastSyncedAt?: string | null
  }
}

export function ZernioProjectControl({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<ProjectState | null>(null)
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/zernio/project?projectId=${encodeURIComponent(projectId)}`, {
        cache: "no-store",
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo consultar Zernio")
      setState(data as ProjectState)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo consultar Zernio")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const handleOpen = () => {
    setOpen(true)
    void load()
  }

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
      setState({ ...data, canManage: true } as ProjectState)
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
        body: JSON.stringify({ projectId, platform }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.authUrl) throw new Error(data?.error || "No se pudo iniciar la conexión")
      window.location.assign(data.authUrl)
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "No se pudo iniciar la conexión")
      setAction(null)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-3 text-xs text-white/70 transition-colors hover:bg-white/5"
        title="Canales sociales conectados con Zernio"
      >
        <Radio className="h-3.5 w-3.5 text-quepia-cyan" />
        Zernio
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Cerrar configuración de Zernio"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[90svh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#171717] p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-quepia-cyan" />
                  <h2 className="text-base font-semibold text-white">Publicación social</h2>
                </div>
                <p className="mt-1 text-xs text-white/40">Conexiones de Zernio para este proyecto.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1.5 hover:bg-white/10">
                <X className="h-4 w-4 text-white/50" />
              </button>
            </div>

            {loading && !state ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-quepia-cyan" />
              </div>
            ) : !state?.configured ? (
              <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-center">
                <Unplug className="mx-auto mb-3 h-6 w-6 text-white/25" />
                <p className="text-sm text-white/75">Este proyecto todavía no está vinculado.</p>
                <p className="mt-1 text-xs text-white/35">Se creará un perfil aislado en Zernio para sus cuentas.</p>
                {state?.canManage ? (
                  <button
                    type="button"
                    onClick={activate}
                    disabled={action === "activate"}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {action === "activate" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Activar Zernio
                  </button>
                ) : (
                  <p className="mt-4 text-xs text-amber-300/70">Solo un administrador puede activarlo.</p>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-sm text-white/85">Perfil activo</p>
                      <p className="text-[11px] text-white/35">{state.profile?.name}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => void load()} disabled={loading} className="rounded-md p-2 hover:bg-white/5">
                    <RefreshCw className={cn("h-3.5 w-3.5 text-white/45", loading && "animate-spin")} />
                  </button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium text-white/55">Cuentas conectadas</p>
                  {state.accounts.length === 0 ? (
                    <p className="rounded-lg border border-white/8 bg-white/[0.02] p-3 text-xs text-white/35">Todavía no hay cuentas conectadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {state.accounts.map((account) => (
                        <div key={account.zernio_account_id} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.025] px-3 py-2">
                          <div>
                            <p className="text-sm capitalize text-white/80">{account.platform}</p>
                            <p className="text-[11px] text-white/35">{account.display_name || account.username || "Cuenta conectada"}</p>
                          </div>
                          <span className={cn(
                            "rounded-full px-2 py-0.5 text-[10px]",
                            account.is_active && !account.needs_reconnection
                              ? "bg-emerald-400/10 text-emerald-300"
                              : "bg-amber-400/10 text-amber-300",
                          )}>
                            {account.is_active && !account.needs_reconnection ? "Lista" : "Reconectar"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {state.canManage && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-white/55">Conectar otra cuenta</p>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map((platform) => (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => void connect(platform.id)}
                          disabled={Boolean(action)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-white/65 hover:border-quepia-cyan/30 hover:text-quepia-cyan disabled:opacity-40"
                        >
                          {action === platform.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                          {platform.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {(error || state?.syncError) && (
              <p className="mt-4 rounded-lg border border-red-400/15 bg-red-400/[0.05] p-3 text-xs text-red-300">
                {error || state?.syncError}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
