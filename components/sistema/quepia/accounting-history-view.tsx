"use client"

import { useState, useEffect, useMemo } from "react"
import {
    History,
    Filter,
    Calendar,
    ArrowUpRight,
    ArrowDownLeft,
    ArrowLeftRight,
    RefreshCw,
    DollarSign,
    TrendingUp,
    TrendingDown,
    CreditCard,
    Receipt,
    Wallet,
    ChevronLeft,
    ChevronRight,
    ExternalLink
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { UnifiedMovement, HistoryFilters, HistorySummary, Account, UnifiedMovementType, Currency } from "@/types/accounting"

interface AccountingHistoryViewProps {
    history: UnifiedMovement[]
    loading: boolean
    summary: HistorySummary | null
    accounts: Account[]
    onFetchHistory: (filters?: HistoryFilters) => void
    onFetchSummary: (filters?: Omit<HistoryFilters, 'limit' | 'offset' | 'movement_type'>) => void
}

const MOVEMENT_TYPE_CONFIG: Record<UnifiedMovementType, { label: string; icon: any; color: string; bgColor: string }> = {
    payment: { label: 'Pago', icon: CreditCard, color: 'text-emerald-400', bgColor: 'bg-emerald-400/20' },
    expense: { label: 'Gasto', icon: Receipt, color: 'text-red-400', bgColor: 'bg-red-400/20' },
    transfer_in: { label: 'Transferencia entrada', icon: ArrowDownLeft, color: 'text-blue-400', bgColor: 'bg-blue-400/20' },
    transfer_out: { label: 'Transferencia salida', icon: ArrowUpRight, color: 'text-orange-400', bgColor: 'bg-orange-400/20' },
    adjustment: { label: 'Ajuste', icon: RefreshCw, color: 'text-amber-400', bgColor: 'bg-amber-400/20' },
}

const ITEMS_PER_PAGE = 50

export function AccountingHistoryView({
    history,
    loading,
    summary,
    accounts,
    onFetchHistory,
    onFetchSummary,
}: AccountingHistoryViewProps) {
    // Filters
    const [filterType, setFilterType] = useState<UnifiedMovementType | 'transfer' | 'all'>('all')
    const [filterAccount, setFilterAccount] = useState<string>('all')
    const [filterStartDate, setFilterStartDate] = useState<string>('')
    const [filterEndDate, setFilterEndDate] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(0)

    // Build filters object
    const buildFilters = (): HistoryFilters => ({
        start_date: filterStartDate || undefined,
        end_date: filterEndDate || undefined,
        account_id: filterAccount !== 'all' ? filterAccount : undefined,
        movement_type: filterType !== 'all' ? filterType as UnifiedMovementType : undefined,
        limit: ITEMS_PER_PAGE,
        offset: currentPage * ITEMS_PER_PAGE,
    })

    // Fetch data when filters change
    useEffect(() => {
        onFetchHistory(buildFilters())
        onFetchSummary({
            start_date: filterStartDate || undefined,
            end_date: filterEndDate || undefined,
            account_id: filterAccount !== 'all' ? filterAccount : undefined,
        })
    }, [filterType, filterAccount, filterStartDate, filterEndDate, currentPage])

    // Initial load
    useEffect(() => {
        onFetchHistory(buildFilters())
        onFetchSummary({})
    }, [])

    const handleClearFilters = () => {
        setFilterType('all')
        setFilterAccount('all')
        setFilterStartDate('')
        setFilterEndDate('')
        setCurrentPage(0)
    }

    const formatMoney = (amount: number | null | undefined, currency: Currency) => {
        const safeAmount = amount ?? 0
        if (currency === 'USD') {
            return `US$ ${safeAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        }
        return `$ ${safeAmount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr + 'T00:00:00')
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    // Group movements by date
    const groupedHistory = useMemo(() => {
        const groups: Record<string, UnifiedMovement[]> = {}
        history.forEach(movement => {
            const date = movement.date
            if (!groups[date]) {
                groups[date] = []
            }
            groups[date].push(movement)
        })
        return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
    }, [history])

    const hasActiveFilters = filterType !== 'all' || filterAccount !== 'all' || filterStartDate || filterEndDate

    if (loading && history.length === 0) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-indigo-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        Ingresos ARS
                    </div>
                    <p className="text-xl font-bold text-emerald-400">{formatMoney(summary?.total_income_ars, 'ARS')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        Ingresos USD
                    </div>
                    <p className="text-xl font-bold text-emerald-400">{formatMoney(summary?.total_income_usd, 'USD')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <TrendingDown className="h-4 w-4 text-red-400" />
                        Gastos ARS
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatMoney(summary?.total_expenses_ars, 'ARS')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <TrendingDown className="h-4 w-4 text-red-400" />
                        Gastos USD
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatMoney(summary?.total_expenses_usd, 'USD')}</p>
                </div>
            </div>

            {/* Stats row */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-white/60">
                <span className="flex items-center gap-1.5">
                    <History className="h-4 w-4" />
                    {summary?.movement_count ?? 0} movimientos
                </span>
                <span className="flex items-center gap-1.5">
                    <ArrowLeftRight className="h-4 w-4" />
                    {summary?.total_transfers ?? 0} transferencias
                </span>
                <span className="flex items-center gap-1.5">
                    <RefreshCw className="h-4 w-4" />
                    {summary?.total_adjustments ?? 0} ajustes
                </span>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Historial de Movimientos</h2>
                    <p className="text-white/40 text-sm">Todos los movimientos de dinero del sistema</p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                <Filter className="h-4 w-4 text-white/40" />

                {/* Type filter */}
                <select
                    value={filterType}
                    onChange={(e) => {
                        setFilterType(e.target.value as any)
                        setCurrentPage(0)
                    }}
                    className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-indigo-500"
                >
                    <option value="all">Todos los tipos</option>
                    <option value="payment">Pagos</option>
                    <option value="expense">Gastos</option>
                    <option value="transfer">Transferencias</option>
                    <option value="adjustment">Ajustes</option>
                </select>

                {/* Account filter */}
                <select
                    value={filterAccount}
                    onChange={(e) => {
                        setFilterAccount(e.target.value)
                        setCurrentPage(0)
                    }}
                    className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-indigo-500"
                >
                    <option value="all">Todas las cuentas</option>
                    {accounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                </select>

                {/* Date range */}
                <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-white/40" />
                    <input
                        type="date"
                        value={filterStartDate}
                        onChange={(e) => {
                            setFilterStartDate(e.target.value)
                            setCurrentPage(0)
                        }}
                        className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-indigo-500"
                    />
                    <span className="text-white/40">-</span>
                    <input
                        type="date"
                        value={filterEndDate}
                        onChange={(e) => {
                            setFilterEndDate(e.target.value)
                            setCurrentPage(0)
                        }}
                        className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-indigo-500"
                    />
                </div>

                {hasActiveFilters && (
                    <button
                        onClick={handleClearFilters}
                        className="px-3 py-1.5 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                    >
                        Limpiar filtros
                    </button>
                )}
            </div>

            {/* History List */}
            <div className="space-y-6">
                {groupedHistory.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                        No hay movimientos con los filtros seleccionados.
                    </div>
                ) : (
                    groupedHistory.map(([date, movements]) => (
                        <div key={date}>
                            {/* Date header */}
                            <div className="flex items-center gap-3 mb-3">
                                <div className="text-sm font-medium text-white/60">{formatDate(date)}</div>
                                <div className="flex-1 h-px bg-white/[0.06]" />
                                <div className="text-xs text-white/40">{movements.length} mov.</div>
                            </div>

                            {/* Movements for this date */}
                            <div className="space-y-2">
                                {movements.map((movement) => {
                                    const config = MOVEMENT_TYPE_CONFIG[movement.movement_type] || MOVEMENT_TYPE_CONFIG.expense
                                    const Icon = config.icon

                                    return (
                                        <div
                                            key={`${movement.movement_type}-${movement.id}`}
                                            className="flex items-center gap-4 p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl hover:border-white/[0.1] transition-colors"
                                        >
                                            {/* Icon */}
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                                                config.bgColor
                                            )}>
                                                <Icon className={cn("h-5 w-5", config.color)} />
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-medium text-white truncate">
                                                                {movement.description}
                                                            </span>
                                                            <span className={cn(
                                                                "text-xs px-2 py-0.5 rounded-full",
                                                                config.bgColor,
                                                                config.color
                                                            )}>
                                                                {config.label}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 text-sm text-white/40">
                                                            {movement.account_name && (
                                                                <span className="flex items-center gap-1">
                                                                    <div
                                                                        className="w-2 h-2 rounded-full"
                                                                        style={{ backgroundColor: movement.account_color || '#6b7280' }}
                                                                    />
                                                                    {movement.account_name}
                                                                </span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <div
                                                                    className="w-2 h-2 rounded-full"
                                                                    style={{ backgroundColor: movement.related_color }}
                                                                />
                                                                {movement.related_entity}
                                                            </span>
                                                        </div>
                                                        {movement.notes && (
                                                            <p className="text-xs text-white/30 mt-1 line-clamp-1">{movement.notes}</p>
                                                        )}
                                                    </div>

                                                    {/* Amount */}
                                                    <div className="text-right flex-shrink-0">
                                                        <p className={cn(
                                                            "text-lg font-semibold",
                                                            movement.is_income ? "text-emerald-400" : "text-red-400"
                                                        )}>
                                                            {movement.is_income ? '+' : '-'}{formatMoney(movement.amount, movement.currency)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Pagination */}
            {history.length > 0 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/[0.06]">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                    </button>
                    <span className="text-sm text-white/40">
                        Página {currentPage + 1}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={history.length < ITEMS_PER_PAGE}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        Siguiente
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* Loading overlay */}
            {loading && history.length > 0 && (
                <div className="fixed inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                    <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-indigo-400 rounded-full" />
                </div>
            )}
        </div>
    )
}
