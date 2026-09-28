'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ExternalLink,
  FolderArchive,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import type {
  BackupClient,
  BackupMonth,
} from '@/lib/sistema/monthly-backup-summary'

type Overview = {
  enabled: boolean
  clients: BackupClient[]
  running: boolean
  lastRun: string | null
  lastError: string | null
}
const monthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'long' })
const dateLabel = (value: string) =>
  new Date(value).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
const buttonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40'

async function readResponse(response: Response) {
  const body = await response.json()
  if (!response.ok)
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : body.error?.message ||
            body.message ||
            'No se pudo cargar el respaldo.',
    )
  return body
}

export function MonthlyBackupsView() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('all')
  const mounted = useRef(true)
  const stop = useRef(false)
  const inFlight = useRef(false)
  const load = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      const next = await readResponse(
        await fetch('/api/admin/monthly-backups', { cache: 'no-store' }),
      )
      if (mounted.current) {
        setData(next)
        setError(null)
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudieron cargar los backups.',
        )
    } finally {
      inFlight.current = false
      if (mounted.current) setLoading(false)
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, 15_000)
    return () => {
      mounted.current = false
      stop.current = true
      window.clearInterval(timer)
    }
  }, [load])

  const totals = useMemo(
    () =>
      (data?.clients || [])
        .flatMap((c) => c.months)
        .reduce(
          (a, m) => ({
            total: a.total + m.total,
            saved: a.saved + m.backedUp,
            pending: a.pending + m.pending,
            failed: a.failed + m.failed,
          }),
          { total: 0, saved: 0, pending: 0, failed: 0 },
        ),
    [data],
  )
  const selected = data?.clients.find((c) => c.id === selectedId)
  const years = [
    ...new Set(selected?.months.map((m) => m.key.slice(0, 4)) || []),
  ]
  const clients = (data?.clients || []).filter((c) =>
    c.name.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')),
  )

  async function processPending() {
    if (processing) return
    stop.current = false
    setProcessing(true)
    setNotice(
      'Preparando las copias. Podés seguir usando el sistema; cada lote guarda su progreso.',
    )
    let created = 0
    let failed = 0
    try {
      for (let batch = 0; batch < 50 && !stop.current; batch++) {
        const result = await readResponse(
          await fetch('/api/admin/monthly-backups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ retryErrors: batch === 0 }),
          }),
        )
        if (!mounted.current) return
        created += result.created || 0
        failed += result.failed || 0
        await load()
        if (result.busy) {
          setNotice(
            'Hay otro respaldo en curso. El progreso se actualiza automáticamente.',
          )
          return
        }
        setNotice(
          `${created} versiones respaldadas en esta ejecución.${failed ? ` ${failed} intentos fallidos; revisá el detalle por mes.` : ''}`,
        )
        if (!result.created && !result.failed && !result.continued) break
      }
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'No se pudo completar el respaldo.',
        )
        setNotice(
          'El respaldo se interrumpió. Las copias terminadas están guardadas; podés continuar con Respaldar pendientes.',
        )
      }
    } finally {
      if (mounted.current) {
        setProcessing(false)
        void load()
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-6xl space-y-7 px-4 py-6 sm:px-8 sm:py-9">
        <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-quepia-cyan">
              <Archive className="h-4 w-4" /> Archivo de la agencia
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Backups mensuales
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">
              Los archivos de cada cliente, organizados por su mes de subida.
              Incluye todas las versiones disponibles desde el inicio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void load()}
              disabled={loading}
              aria-label="Actualizar backups"
            >
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
            {processing ? (
              <button
                type="button"
                className={buttonClass}
                onClick={() => {
                  stop.current = true
                  setNotice(
                    'Se detendrá al terminar el lote actual. Las copias terminadas quedan guardadas.',
                  )
                }}
              >
                <Loader2 className="h-4 w-4 animate-spin" /> Detener después de
                este lote
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void processPending()}
                disabled={
                  !data?.enabled ||
                  data.running ||
                  totals.pending + totals.failed === 0
                }
                className={`${buttonClass} bg-quepia-cyan text-black hover:bg-quepia-cyan/90`}
              >
                <FolderArchive className="h-4 w-4" />{' '}
                {data?.running ? 'Respaldo en curso' : 'Respaldar pendientes'}
              </button>
            )}
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200"
          >
            {error}
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => void load()}
            >
              Reintentar
            </button>
          </div>
        )}
        {notice && (
          <p
            role="status"
            className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70"
          >
            {notice}
          </p>
        )}
        {data && !data.enabled && (
          <p
            role="alert"
            className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-white/80"
          >
            La conexión de respaldo con Drive está desactivada. El historial se
            muestra, pero las copias están pendientes.
          </p>
        )}
        {data?.lastError && (
          <p role="alert" className="text-sm text-white/80">
            Última ejecución: {data.lastError}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ['Versiones registradas', totals.total],
            ['Respaldadas', totals.saved],
            ['Pendientes', totals.pending],
            ['Para revisar', totals.failed],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5"
            >
              <p className="text-xs text-white/60">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums">
                {loading ? '—' : value}
              </p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/40">
          <span>Revisión automática diaria · Horario de Argentina</span>
          <span>
            {data?.lastRun
              ? `Última ejecución: ${dateLabel(data.lastRun)}`
              : 'Sin ejecuciones registradas'}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando historial…
          </div>
        ) : selected ? (
          <section className="space-y-5">
            <button
              type="button"
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
              onClick={() => {
                setSelectedId(null)
                setYear('all')
              }}
            >
              <ArrowLeft className="h-4 w-4" /> Todos los clientes
            </button>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{selected.name}</h2>
                <p className="mt-1 text-sm text-white/60">
                  {selected.months.length} meses con archivos registrados
                </p>
              </div>
              <select
                aria-label="Filtrar por año"
                value={year}
                onChange={(event) => setYear(event.target.value)}
                className="rounded-lg border border-white/10 bg-[#1a1a1a] px-3 py-2 text-sm"
              >
                <option value="all">Todos los años</option>
                {years.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </div>
            {!selected.months.length && <EmptyState />}
            {years
              .filter((value) => year === 'all' || year === value)
              .map((value) => (
                <div key={value} className="space-y-3">
                  <h3 className="text-sm font-medium text-white/40">{value}</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {selected.months
                      .filter((m) => m.key.startsWith(value))
                      .map((month) => (
                        <MonthCard key={month.key} month={month} />
                      ))}
                  </div>
                </div>
              ))}
          </section>
        ) : (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <h2 className="text-lg font-medium">
                Por cliente{' '}
                <span className="ml-2 text-sm text-white/50">
                  {data?.clients.length || 0}
                </span>
              </h2>
              <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5">
                <Search className="h-4 w-4 text-white/50" />
                <input
                  aria-label="Buscar cliente"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar cliente…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-white/40 sm:w-48"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {clients.map((client) => {
                const total = client.months.reduce((sum, m) => sum + m.total, 0)
                const saved = client.months.reduce(
                  (sum, m) => sum + m.backedUp,
                  0,
                )
                const failed = client.months.reduce(
                  (sum, m) => sum + m.failed,
                  0,
                )
                return (
                  <button
                    type="button"
                    key={client.id}
                    onClick={() => {
                      setSelectedId(client.id)
                      setYear('all')
                    }}
                    className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-left transition hover:border-quepia-cyan/30 hover:bg-white/[0.04]"
                  >
                    <div className="mb-5 flex items-center justify-between">
                      <span className="rounded-xl bg-quepia-cyan/10 p-2.5 text-quepia-cyan">
                        <FolderArchive className="h-5 w-5" />
                      </span>
                      <ChevronRight className="h-4 w-4 text-white/25 group-hover:text-quepia-cyan" />
                    </div>
                    <h3 className="font-medium">{client.name}</h3>
                    <p className="mt-1 text-xs text-white/40">
                      {client.months.length} meses · {total} versiones
                    </p>
                    <div className="my-4 h-1 overflow-hidden rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-quepia-cyan"
                        style={{
                          width: `${total ? (saved / total) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/50">
                        {saved} de {total} respaldadas
                      </span>
                      {failed > 0 ? (
                        <span className="text-white/80">
                          {failed} para revisar
                        </span>
                      ) : total > 0 && saved === total ? (
                        <CheckCircle2
                          aria-label="Todo respaldado"
                          className="h-4 w-4 text-quepia-cyan"
                        />
                      ) : (
                        <Clock3 className="h-4 w-4 text-white/50" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
            {!clients.length && (
              <p className="py-12 text-center text-sm text-white/40">
                No se encontraron clientes.
              </p>
            )}
          </section>
        )}
        <p className="border-t border-white/[0.06] pt-5 text-xs leading-5 text-white/50">
          El historial incluye archivos y versiones subidos al sistema, no
          archivos que nunca se cargaron. Los meses sin subidas no generan
          carpetas. Las copias se conservan si se elimina una tarea; los errores
          indican material que necesita revisión.
        </p>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/40">
      Todavía no hay archivos subidos para este cliente.
    </div>
  )
}

function MonthCard({ month }: { month: BackupMonth }) {
  const complete = month.backedUp === month.total
  return (
    <article className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium capitalize">
          {monthLabel(month.key)} {month.key.slice(0, 4)}
        </h4>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] ${month.failed ? 'bg-amber-400/10 text-white/80' : complete ? 'bg-quepia-cyan/10 text-quepia-cyan' : 'bg-white/5 text-white/50'}`}
        >
          {month.failed
            ? 'Para revisar'
            : complete
              ? 'Respaldado'
              : 'Pendiente'}
        </span>
      </div>
      <p className="text-sm text-white/55">
        {month.backedUp} de {month.total} versiones respaldadas
        {month.open && (
          <span className="ml-2 text-xs text-white/50">· Mes en curso</span>
        )}
      </p>
      {month.lastVerified && (
        <p className="text-xs text-white/50">
          Copias verificadas desde {dateLabel(month.lastVerified)}
        </p>
      )}
      {month.folders.length ? (
        <div className="flex flex-wrap gap-2">
          {month.folders.map((id, index) => (
            <a
              key={id}
              href={`https://drive.google.com/drive/folders/${encodeURIComponent(id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 transition hover:border-quepia-cyan/30 hover:text-quepia-cyan"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir en Drive
              {month.folders.length > 1 ? ` ${index + 1}` : ''}
            </a>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/50">
          La carpeta estará disponible cuando se complete la primera copia.
        </p>
      )}
      {month.errors.length > 0 && (
        <details className="border-t border-white/5 pt-3">
          <summary className="cursor-pointer text-xs text-white/80">
            <TriangleAlert className="mr-1.5 inline h-3.5 w-3.5" />{' '}
            {month.errors.length} archivos para revisar
          </summary>
          <ul className="mt-3 space-y-3">
            {month.errors.map((item) => (
              <li key={item.id} className="text-xs">
                <p className="break-words text-white/70">{item.name}</p>
                <p className="mt-1 break-words text-white/40">{item.message}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  )
}
