"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeftRight,
  Ban,
  Columns3,
  FolderPlus,
  Layers,
  Link2,
  ListChecks,
  LoaderCircle,
  MessageSquare,
  Pencil,
  ReceiptText,
  SquareCheck,
  TrendingUp,
} from "lucide-react"
import type { McpActivityEntry, McpActivityKind } from "@/lib/mcp/activity"

interface VoidApiResponse {
  ok: boolean
  data?: { operation_id: string; status: string; voided_at: string | null }
  error?: { code: string; message: string }
}

const KIND_LABELS: Record<McpActivityKind, string> = {
  "accounting.create_expense": "Gasto",
  "accounting.create_income": "Cobro",
  "accounting.create_transfer": "Transferencia",
  "tasks.create_task": "Tarea nueva",
  "tasks.create_tasks_batch": "Lote de tareas",
  "tasks.update_task": "Tarea editada",
  "tasks.create_subtasks": "Subtareas",
  "tasks.update_subtask": "Subtarea editada",
  "tasks.set_dependencies": "Bloqueos",
  "tasks.add_links": "Links",
  "tasks.post_update": "Aviso",
  "tasks.create_column": "Columna nueva",
  "tasks.create_project": "Proyecto nuevo",
}

const KIND_ICONS: Record<McpActivityKind, typeof ReceiptText> = {
  "accounting.create_expense": ReceiptText,
  "accounting.create_income": TrendingUp,
  "accounting.create_transfer": ArrowLeftRight,
  "tasks.create_task": SquareCheck,
  "tasks.create_tasks_batch": Layers,
  "tasks.update_task": Pencil,
  "tasks.create_subtasks": ListChecks,
  "tasks.update_subtask": ListChecks,
  "tasks.set_dependencies": ArrowLeftRight,
  "tasks.add_links": Link2,
  "tasks.post_update": MessageSquare,
  "tasks.create_column": Columns3,
  "tasks.create_project": FolderPlus,
}

function formatAmount(amount: string | null, currency: string | null): string {
  if (!amount) {
    return "—"
  }
  const value = Number(amount)
  if (!Number.isFinite(value)) {
    return amount
  }
  try {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: currency ?? "ARS",
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency ?? ""} ${amount}`.trim()
  }
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—"
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed)
}

export function ActivityList({
  entries,
  windowHours,
}: {
  entries: readonly McpActivityEntry[]
  windowHours: number
}) {
  if (entries.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-white/60">
        El MCP no escribió nada en las últimas {windowHours} horas.
      </p>
    )
  }

  return (
    <ul className="mt-6 space-y-3">
      {entries.map((entry) => (
        <ActivityRow key={entry.operationId} entry={entry} />
      ))}
    </ul>
  )
}

function ActivityRow({ entry }: { entry: McpActivityEntry }) {
  const router = useRouter()
  const [isVoiding, setIsVoiding] = useState(false)
  const [voided, setVoided] = useState(entry.status === "voided")
  const [message, setMessage] = useState<string | null>(null)

  const Icon = KIND_ICONS[entry.kind]

  async function voidOperation() {
    setIsVoiding(true)
    setMessage(null)

    try {
      const response = await fetch(
        `/api/mcp/operations/${entry.operationId}/void`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Anulado desde el panel web" }),
        },
      )
      const result = (await response.json()) as VoidApiResponse

      if (response.status === 401) {
        const redirectTo = encodeURIComponent(window.location.pathname)
        window.location.assign(`/auth/login?redirectTo=${redirectTo}`)
        return
      }

      if (!response.ok || !result.ok) {
        setMessage(
          result.error?.message ??
            "No se pudo anular el movimiento. Volvé a cargar la página.",
        )
        return
      }

      setVoided(true)
      setMessage("Movimiento anulado y saldo corregido.")
      router.refresh()
    } catch {
      setMessage(
        "No pudimos contactar al control plane. El movimiento sigue registrado.",
      )
    } finally {
      setIsVoiding(false)
    }
  }

  return (
    <li
      className={`rounded-xl border p-4 transition ${
        voided
          ? "border-white/5 bg-white/[0.02] opacity-60"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/50">
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{KIND_LABELS[entry.kind]}</span>
            {entry.riskLevel === 3 && !voided ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                revisar
              </span>
            ) : null}
            {voided ? (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/60">
                anulado
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-base font-semibold text-white">
            {entry.module === "tasks"
              ? (entry.description ?? entry.taskTitle ?? "Sin detalle")
              : formatAmount(entry.amount, entry.currency)}
          </p>

          {entry.module === "tasks" ? (
            entry.taskTitle && entry.taskTitle !== entry.description ? (
              <p className="mt-1 break-words text-sm text-white/70">
                {entry.taskTitle}
              </p>
            ) : null
          ) : (
            <p className="mt-1 break-words text-sm text-white/70">
              {entry.description ??
                entry.clientName ??
                entry.projectName ??
                "Sin detalle"}
            </p>
          )}

          <p className="mt-1 text-xs text-white/40">
            {entry.module === "tasks"
              ? (entry.projectName ?? "Sin proyecto")
              : (entry.date ?? "—")}
            {entry.module === "tasks"
              ? entry.rowCount && entry.rowCount > 1
                ? ` · ${entry.rowCount} filas`
                : ""
              : entry.accountName
                ? ` · ${entry.accountName}`
                : ""}
            {` · registrado ${formatTimestamp(entry.recordedAt)}`}
          </p>
        </div>

        {voided ? null : (
          <button
            type="button"
            disabled={isVoiding}
            onClick={voidOperation}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-red-400/40 hover:text-red-300 focus:outline-none focus:ring-2 focus:ring-red-400/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isVoiding ? (
              <LoaderCircle
                className="h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Ban className="h-4 w-4" aria-hidden="true" />
            )}
            {isVoiding ? "Anulando…" : "Anular"}
          </button>
        )}
      </div>

      {message ? (
        <p
          className={`mt-3 text-sm ${voided ? "text-white/50" : "text-amber-300"}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : entry.voidReason ? (
        <p className="mt-3 text-sm text-white/40">{entry.voidReason}</p>
      ) : null}
    </li>
  )
}
