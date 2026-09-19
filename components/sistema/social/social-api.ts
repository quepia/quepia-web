"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

export class SocialApiError extends Error {
  status: number
  code: string
  details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function socialFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const response = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: "no-store",
    credentials: "same-origin",
  })
  if (response.headers.get("content-type")?.includes("text/csv")) return (await response.text()) as T
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new SocialApiError(response.status, payload?.code ?? "error", payload?.error ?? `Error ${response.status}`, payload?.details)
  }
  return payload as T
}

export function useSocialData<T>(url: string | null) {
  const [state, setState] = useState<{ url: string | null; data: T | null; error: SocialApiError | null; loading: boolean }>(
    { url, data: null, error: null, loading: Boolean(url) },
  )
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    if (!url) return
    const request = ++latest.current
    const controller = new AbortController()
    setState((previous) => ({ url, data: previous.url === url ? previous.data : null, error: null, loading: true }))
    socialFetch<T>(url, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted && request === latest.current) setState({ url, data: result, error: null, loading: false })
      })
      .catch((failure) => {
        if (controller.signal.aborted || request !== latest.current) return
        setState({ url, data: null, error: failure instanceof SocialApiError ? failure : new SocialApiError(0, "network", "No se pudo cargar"), loading: false })
      })
    return () => controller.abort()
  }, [url, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])
  // Nunca renderizar datos del alcance anterior, ni siquiera durante el render
  // previo al efecto. Los refrescos de la misma URL sí conservan sus datos.
  const current = url && state.url === url ? state : { data: null, error: null, loading: Boolean(url) }
  return { data: current.data, error: current.error, loading: current.loading, reload }
}

export type SocialScope = {
  client_ids?: string[]
  project_ids?: string[]
  platforms?: string[]
  account_ids?: string[]
  from?: string
  to?: string
  project_mode?: "attributed" | "accounts"
}

const KEYS = { client: "sc_client", project: "sc_project", platform: "sc_platform", account: "sc_account", from: "sc_from", to: "sc_to", period: "sc_period", mode: "sc_mode", tab: "sc_tab" }

export function todayLocal() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Cordoba" }).format(new Date())
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

/** Filtros cliente→proyecto→plataforma→cuenta→período persistidos en la URL. */
export function useSocialScope() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const get = (key: string) => searchParams.get(key) || undefined
  const to = get(KEYS.to) ?? todayLocal()
  const from = get(KEYS.from) ?? shiftDate(to, -29)

  const scope: SocialScope = useMemo(() => {
    const result: SocialScope = { from, to }
    const client = searchParams.get(KEYS.client)
    const project = searchParams.get(KEYS.project)
    const platform = searchParams.get(KEYS.platform)
    const account = searchParams.get(KEYS.account)
    if (client) result.client_ids = [client]
    if (project) result.project_ids = [project]
    if (platform) result.platforms = [platform]
    if (account) result.account_ids = [account]
    if (searchParams.get(KEYS.mode) === "accounts") result.project_mode = "accounts"
    return result
  }, [searchParams, from, to])

  const update = useCallback((changes: Partial<Record<keyof typeof KEYS, string | null>>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [name, value] of Object.entries(changes)) {
      const key = KEYS[name as keyof typeof KEYS]
      if (value) params.set(key, value)
      else params.delete(key)
    }
    // Cambiar de cliente reinicia selecciones incompatibles.
    if ("client" in changes) {
      params.delete(KEYS.project)
      params.delete(KEYS.account)
      params.delete(KEYS.platform)
      params.delete(KEYS.mode)
    }
    if ("project" in changes || "platform" in changes) params.delete(KEYS.account)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }, [pathname, router, searchParams])

  return {
    scope,
    tab: searchParams.get(KEYS.tab) || "agency",
    selected: {
      client: searchParams.get(KEYS.client) || "",
      project: searchParams.get(KEYS.project) || "",
      platform: searchParams.get(KEYS.platform) || "",
      account: searchParams.get(KEYS.account) || "",
      mode: searchParams.get(KEYS.mode) || "attributed",
      period: searchParams.get(KEYS.period) || "",
    },
    update,
  }
}

export function paramsQuery(params: object) {
  return `params=${encodeURIComponent(JSON.stringify(params))}`
}

export const numberFormat = new Intl.NumberFormat("es-AR")
export function formatValue(value: unknown, unit?: string) {
  if (value === null || value === undefined || value === "") return "—"
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  if (unit === "ratio") return `${(number * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`
  if (unit === "milliseconds") return `${(number / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s`
  return numberFormat.format(Math.round(number * 100) / 100)
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short", hour12: false, timeZone: "America/Argentina/Cordoba" }).format(new Date(value))
}

export function relativeAge(value: string | null | undefined) {
  if (!value) return "sin datos"
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return "recién"
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `hace ${hours} h`
  return `hace ${Math.round(hours / 24)} d`
}
