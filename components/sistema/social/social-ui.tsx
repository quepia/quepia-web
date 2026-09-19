"use client"

import { useMemo, useState, type ReactNode } from "react"
import { AlertTriangle, CircleDashed, CircleSlash, Clock, HelpCircle, Info, Loader2, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { formatValue, type SocialApiError } from "./social-api"

export const SERIES_COLOR = "#159e9b" // validado sobre #0a0a0a (L y contraste)

export function Panel({ title, description, actions, children, className }: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.02]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-medium text-white/90">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-[#a3a3a3]">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Loading({ label = "Cargando" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-[#a3a3a3]">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: SocialApiError | Error | null; onRetry?: () => void }) {
  if (!error) return null
  if ("code" in error && error.code === "setup_required") {
    return (
      <div role="status" className="rounded-lg border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-100">
        <h2 className="font-medium">Gestión social: configuración pendiente</h2>
        <p className="mt-1">Falta completar la instalación del módulo en este entorno. Las funciones sociales estarán disponibles cuando termine la configuración.</p>
        {onRetry && <button onClick={onRetry} className="mt-3 underline">Comprobar de nuevo</button>}
      </div>
    )
  }
  const forbidden = "status" in error && (error.status === 403 || error.status === 401)
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-sm text-red-200">
      {forbidden ? <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="flex-1">
        <p>{forbidden ? "Este módulo es exclusivo de administradores globales activos de Quepia." : error.message}</p>
        {"code" in error && error.code && !forbidden && <p className="text-xs text-red-200/60">Código: {String(error.code)}</p>}
      </div>
      {onRetry && !forbidden && <button onClick={onRetry} className="text-xs underline">Reintentar</button>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-[#a3a3a3]">{children}</p>
}

const STATUS_META: Record<string, { label: string; icon: typeof Info; className: string }> = {
  valid: { label: "Válido", icon: Info, className: "text-[#a3a3a3]" },
  partial: { label: "Cobertura parcial", icon: CircleDashed, className: "text-amber-300" },
  no_data: { label: "Sin datos", icon: CircleSlash, className: "text-[#a3a3a3]" },
  not_supported: { label: "No soportado", icon: CircleSlash, className: "text-[#a3a3a3]" },
  unverified: { label: "Sin validar", icon: HelpCircle, className: "text-amber-300" },
  pending: { label: "Pendiente", icon: Clock, className: "text-amber-300" },
  alias: { label: "Duplica otra métrica (no se suma)", icon: Info, className: "text-[#a3a3a3]" },
}

export function StatusTag({ status }: { status?: string | null }) {
  if (!status || status === "valid") return null
  const meta = STATUS_META[status] ?? { label: status, icon: Info, className: "text-[#a3a3a3]" }
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", meta.className)}>
      <meta.icon className="h-3 w-3" aria-hidden /> {meta.label}
    </span>
  )
}

export function MetricTile({ label, value, unit, status, hint, delta }: {
  label: string
  value: unknown
  unit?: string
  status?: string | null
  hint?: string
  delta?: { absolute?: number | null; percent?: number | null; reason?: string | null } | null
}) {
  const unavailable = status === "not_supported" || status === "unverified" || status === "no_data"
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5" title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[#a3a3a3]">{label}</span>
        {hint && <HelpCircle className="h-3 w-3 text-[#a3a3a3]" aria-label={hint} />}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white/90">{unavailable ? "—" : formatValue(value, unit)}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <StatusTag status={status} />
        {delta && <DeltaText delta={delta} unit={unit} />}
      </div>
    </div>
  )
}

export function DeltaText({ delta, unit }: { delta: { absolute?: number | null; percent?: number | null; reason?: string | null }; unit?: string }) {
  if (delta.absolute === null || delta.absolute === undefined) return <span className="text-[11px] text-[#a3a3a3]">sin comparación</span>
  const sign = delta.absolute > 0 ? "+" : ""
  return (
    <span className="text-[11px] tabular-nums text-[#a3a3a3]">
      {sign}{unit === "ratio" ? `${(Number(delta.absolute) * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} p.p.` : formatValue(delta.absolute, unit)}{" "}
      {delta.percent !== null && delta.percent !== undefined
        ? `(${sign}${Number(delta.percent).toLocaleString("es-AR")}%)`
        : <span className="text-[#a3a3a3]">(% no disponible{delta.reason === "denominador_cero" ? ": base 0" : ""})</span>}
    </span>
  )
}

export function Select({ label, value, onChange, options, className }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <label className={cn("flex flex-col gap-1 text-[11px] text-[#a3a3a3]", className)}>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-white/10 bg-[#141414] px-2 text-sm text-white/85 outline-none focus:border-white/25"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

export function Button({ children, onClick, disabled, variant = "secondary", type = "button", title }: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: "primary" | "secondary" | "danger" | "ghost"
  type?: "button" | "submit"
  title?: string
}) {
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "primary" && "bg-white text-black hover:bg-white/90",
        variant === "secondary" && "border border-white/10 bg-white/[0.03] text-white/80 hover:bg-white/[0.07]",
        variant === "danger" && "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
        variant === "ghost" && "text-[#a3a3a3] hover:text-white",
      )}
    >
      {children}
    </button>
  )
}

/** Serie única con crosshair y tooltip; vista de tabla accesible. */
export function LineChart({ points, unit, title }: { points: Array<{ label: string; value: number | null; note?: string }>; unit?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  const width = 640
  const height = 180
  const pad = { top: 12, right: 12, bottom: 22, left: 48 }
  const valid = points.filter((point) => point.value !== null) as Array<{ label: string; value: number }>
  const { min, max } = useMemo(() => {
    if (!valid.length) return { min: 0, max: 1 }
    const values = valid.map((point) => point.value)
    const low = Math.min(...values)
    const high = Math.max(...values)
    return { min: low === high ? low - 1 : low, max: low === high ? high + 1 : high }
  }, [valid])
  if (points.length === 0) return <Empty>Sin datos para el período.</Empty>
  const x = (index: number) => pad.left + (points.length === 1 ? 0 : (index / (points.length - 1)) * (width - pad.left - pad.right))
  const y = (value: number) => pad.top + (1 - (value - min) / (max - min)) * (height - pad.top - pad.bottom)
  let path = ""
  points.forEach((point, index) => {
    if (point.value === null) return
    const previous = points[index - 1]
    path += `${!previous || previous.value === null ? "M" : "L"}${x(index).toFixed(1)},${y(point.value).toFixed(1)} `
  })
  const active = hover !== null ? points[hover] : null
  return (
    <figure className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <figcaption className="text-xs text-[#a3a3a3]">{title}</figcaption>
        <button onClick={() => setAsTable((value) => !value)} className="text-[11px] text-[#a3a3a3] underline">
          {asTable ? "Ver gráfico" : "Ver tabla"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-56 overflow-auto">
          <table className="w-full text-xs">
            <tbody>
              {points.map((point) => (
                <tr key={point.label} className="border-b border-white/[0.04]">
                  <td className="py-1 text-[#a3a3a3]">{point.label}</td>
                  <td className="py-1 text-right tabular-nums text-white/80">{point.value === null ? "sin dato" : formatValue(point.value, unit)}</td>
                  <td className="py-1 pl-2 text-[#a3a3a3]">{point.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={title}
            onMouseLeave={() => setHover(null)}
            onMouseMove={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              const relative = ((event.clientX - rect.left) / rect.width) * width
              const index = Math.round(((relative - pad.left) / (width - pad.left - pad.right)) * (points.length - 1))
              setHover(Math.max(0, Math.min(points.length - 1, index)))
            }}>
            {[0, 0.5, 1].map((fraction) => {
              const value = min + (max - min) * fraction
              return (
                <g key={fraction}>
                  <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="rgba(255,255,255,0.06)" />
                  <text x={pad.left - 6} y={y(value) + 3} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.4)">{formatValue(value, unit)}</text>
                </g>
              )
            })}
            <text x={pad.left} y={height - 4} fontSize="10" fill="rgba(255,255,255,0.4)">{points[0]?.label}</text>
            <text x={width - pad.right} y={height - 4} fontSize="10" textAnchor="end" fill="rgba(255,255,255,0.4)">{points.at(-1)?.label}</text>
            <path d={path} fill="none" stroke={SERIES_COLOR} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {hover !== null && active && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} stroke="rgba(255,255,255,0.2)" />
                {active.value !== null && <circle cx={x(hover)} cy={y(active.value)} r="4" fill={SERIES_COLOR} stroke="#0a0a0a" strokeWidth="2" />}
              </>
            )}
          </svg>
          {active && (
            <div className="pointer-events-none absolute top-0 rounded-md border border-white/10 bg-[#141414] px-2 py-1 text-xs text-white/80 shadow"
              style={{ left: `${Math.min(80, (x(hover!) / width) * 100)}%` }}>
              <div className="text-[#a3a3a3]">{active.label}</div>
              <div className="tabular-nums">{active.value === null ? "sin dato" : formatValue(active.value, unit)}</div>
              {active.note && <div className="text-[#a3a3a3]">{active.note}</div>}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn",
  threads: "Threads", twitter: "X", pinterest: "Pinterest", bluesky: "Bluesky",
}

export const FORMAT_LABEL: Record<string, string> = {
  reel: "Reel", image: "Imagen", carousel: "Carrusel", video: "Video", story: "Story", text: "Texto", unknown: "Sin clasificar",
}
