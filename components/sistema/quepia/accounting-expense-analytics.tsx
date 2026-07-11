"use client"

import { useState } from "react"
import { BarChart3, Calendar, ChevronLeft, ChevronRight, Tags, Users, WalletCards } from "lucide-react"
import type { Currency, ExpenseAnalytics } from "@/types/accounting"

interface AccountingExpenseAnalyticsProps {
    analytics: ExpenseAnalytics | null
    loading: boolean
    onFetch: (year: number, currency: Currency) => void
}

const EXPENSE_TYPE_LABELS: Record<string, string> = {
    salary: 'Sueldos',
    project_fee: 'Trabajos por proyecto',
    advance: 'Adelantos',
    bonus: 'Bonos',
    reimbursement: 'Reintegros',
    subscription: 'Suscripciones',
    tax: 'Impuestos',
    service: 'Servicios',
    purchase: 'Compras',
    other: 'Otros',
}

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function AccountingExpenseAnalytics({
    analytics,
    loading,
    onFetch,
}: AccountingExpenseAnalyticsProps) {
    const [year, setYear] = useState(analytics?.year || new Date().getFullYear())
    const [currency, setCurrency] = useState<Currency>(analytics?.currency || 'ARS')

    const changeFilters = (nextYear: number, nextCurrency: Currency) => {
        setYear(nextYear)
        setCurrency(nextCurrency)
        onFetch(nextYear, nextCurrency)
    }

    const formatCurrency = (amount: number | null | undefined) => new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
    }).format(Number(amount || 0))

    if (loading && !analytics) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-red-400" />
            </div>
        )
    }

    const total = Number(analytics?.total_amount || 0)
    const maxMonthly = Math.max(0, ...(analytics?.monthly || []).map(item => Number(item.total_amount || 0)))

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-white">Análisis de gastos</h2>
                    <p className="text-sm text-white/40">Categorías, personas, conceptos y evolución histórica</p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-1">
                        {(['ARS', 'USD'] as Currency[]).map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => changeFilters(year, option)}
                                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${currency === option ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-1">
                        <button
                            type="button"
                            onClick={() => changeFilters(year - 1, currency)}
                            className="rounded p-2 text-white/50 hover:bg-white/10 hover:text-white"
                            aria-label="Año anterior"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="flex min-w-20 items-center justify-center gap-2 px-2 text-sm font-medium">
                            <Calendar className="h-4 w-4 text-white/40" />
                            {year}
                        </span>
                        <button
                            type="button"
                            onClick={() => changeFilters(year + 1, currency)}
                            disabled={year >= new Date().getFullYear()}
                            className="rounded p-2 text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-30"
                            aria-label="Año siguiente"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard icon={WalletCards} label="Total gastado" value={formatCurrency(total)} color="text-red-400" />
                <MetricCard icon={BarChart3} label="Movimientos" value={String(analytics?.expense_count || 0)} color="text-violet-400" />
                <MetricCard icon={Users} label="Con persona/proveedor" value={String(analytics?.classified_count || 0)} color="text-emerald-400" />
                <MetricCard icon={Tags} label="Pendientes de clasificar" value={String(analytics?.unclassified_count || 0)} color="text-amber-400" />
            </div>

            <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
                <div className="mb-5 flex items-center gap-3">
                    <div className="rounded-lg bg-emerald-500/15 p-2">
                        <Users className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Sueldos y pagos por persona</h3>
                        <p className="text-sm text-white/40">Histórico anual separado por sueldo, proyecto y adelantos</p>
                    </div>
                </div>

                {(analytics?.salary_by_person || []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-white/40">No hay pagos de sueldos para este período.</p>
                ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                        {analytics?.salary_by_person.map(person => (
                            <article key={person.id || person.label} className="rounded-lg border border-white/[0.07] bg-black/20 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h4 className="font-medium text-white">{person.label}</h4>
                                        <p className="mt-1 text-xs text-white/40">{person.payment_count} pagos registrados</p>
                                    </div>
                                    <p className="text-lg font-semibold text-emerald-400">{formatCurrency(person.total_amount)}</p>
                                </div>
                                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                                    <Breakdown label="Sueldo" value={formatCurrency(person.salary_amount)} />
                                    <Breakdown label="Proyectos" value={formatCurrency(person.project_fee_amount)} />
                                    <Breakdown label="Adelantos" value={formatCurrency(person.advance_amount)} />
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
                <BreakdownList
                    title="Por categoría"
                    items={(analytics?.by_category || []).map(item => ({
                        id: item.id || item.label || 'category',
                        label: item.label || 'Sin categoría',
                        amount: Number(item.total_amount || 0),
                        count: item.expense_count,
                    }))}
                    total={total}
                    formatCurrency={formatCurrency}
                />
                <BreakdownList
                    title="Por persona o proveedor"
                    items={(analytics?.by_counterparty || []).map(item => ({
                        id: item.id || item.label || 'counterparty',
                        label: item.label || 'Sin asignar',
                        amount: Number(item.total_amount || 0),
                        count: item.expense_count,
                    }))}
                    total={total}
                    formatCurrency={formatCurrency}
                />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <BreakdownList
                    title="Por concepto"
                    items={(analytics?.by_type || []).map(item => ({
                        id: item.id || 'other',
                        label: EXPENSE_TYPE_LABELS[item.id || 'other'] || item.id || 'Otros',
                        amount: Number(item.total_amount || 0),
                        count: item.expense_count,
                    }))}
                    total={total}
                    formatCurrency={formatCurrency}
                />

                <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
                    <h3 className="mb-5 font-semibold text-white">Evolución mensual</h3>
                    <div className="flex h-56 items-end gap-2">
                        {MONTHS.map((month, index) => {
                            const item = analytics?.monthly.find(entry => Number(entry.month) === index + 1)
                            const amount = Number(item?.total_amount || 0)
                            const height = maxMonthly > 0 ? Math.max(2, amount / maxMonthly * 100) : 0
                            return (
                                <div key={month} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                                    <div className="flex h-full w-full items-end justify-center">
                                        <div
                                            className="w-full max-w-6 rounded-t bg-red-400/75 transition-all"
                                            style={{ height: `${height}%` }}
                                            title={`${month}: ${formatCurrency(amount)}`}
                                        />
                                    </div>
                                    <span className="text-[10px] text-white/40">{month}</span>
                                </div>
                            )
                        })}
                    </div>
                </section>
            </div>
        </div>
    )
}

function MetricCard({ icon: Icon, label, value, color }: {
    icon: typeof WalletCards
    label: string
    value: string
    color: string
}) {
    return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-white/45">
                <Icon className={`h-4 w-4 ${color}`} />
                {label}
            </div>
            <p className={`text-2xl font-semibold ${color}`}>{value}</p>
        </div>
    )
}

function Breakdown({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-white/[0.04] p-2">
            <p className="text-white/40">{label}</p>
            <p className="mt-1 truncate font-medium text-white/80" title={value}>{value}</p>
        </div>
    )
}

function BreakdownList({ title, items, total, formatCurrency }: {
    title: string
    items: Array<{ id: string; label: string; amount: number; count: number }>
    total: number
    formatCurrency: (amount: number) => string
}) {
    return (
        <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5">
            <h3 className="mb-5 font-semibold text-white">{title}</h3>
            {items.length === 0 ? (
                <p className="py-8 text-center text-sm text-white/40">Sin datos para este período.</p>
            ) : (
                <div className="space-y-4">
                    {items.slice(0, 8).map(item => {
                        const percentage = total > 0 ? item.amount / total * 100 : 0
                        return (
                            <div key={item.id}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate text-white/75">{item.label} <span className="text-white/30">({item.count})</span></span>
                                    <span className="whitespace-nowrap font-medium text-white">{formatCurrency(item.amount)}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                                    <div className="h-full rounded-full bg-red-400/70" style={{ width: `${Math.min(100, percentage)}%` }} />
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
