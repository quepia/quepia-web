"use client"

import { useState, useMemo } from "react"
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    PieChart,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Wallet,
    AlertCircle,
    HelpCircle
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { MonthlyChartData, ExpenseDistribution, Account } from "@/types/accounting"

interface ChartsViewProps {
    monthlyData: MonthlyChartData[]
    expenseDistribution: ExpenseDistribution[]
    accounts: Account[]
    chartLoading: boolean
    selectedYear: number
    unassignedBalance?: number
    onYearChange: (year: number) => void
}

export function AccountingChartsView({
    monthlyData,
    expenseDistribution,
    accounts,
    chartLoading,
    selectedYear,
    unassignedBalance: unassignedBalanceProp,
    onYearChange
}: ChartsViewProps) {

    const formatCurrency = (amount: number, currency: string = 'ARS') => {
        if (amount >= 1000000) {
            return `$${(amount / 1000000).toFixed(1)}M`
        }
        if (amount >= 1000) {
            return `$${(amount / 1000).toFixed(0)}K`
        }
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    const formatFullCurrency = (amount: number, currency: string = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    // Calcular máximo para el gráfico de barras
    const maxValue = useMemo(() => {
        if (!monthlyData.length) return 0
        return Math.max(...monthlyData.flatMap(d => [d.total_income, d.total_expenses]))
    }, [monthlyData])

    // Totales del año
    const yearTotals = useMemo(() => {
        return monthlyData.reduce((acc, d) => ({
            income: acc.income + (d.total_income || 0),
            expenses: acc.expenses + (d.total_expenses || 0),
        }), { income: 0, expenses: 0 })
    }, [monthlyData])

    // Totales por moneda en cuentas
    const accountTotalARS = accounts
        .filter(a => a.currency === 'ARS')
        .reduce((sum, a) => sum + (a.current_balance || 0), 0)
    const accountTotalUSD = accounts
        .filter(a => a.currency === 'USD')
        .reduce((sum, a) => sum + (a.current_balance || 0), 0)

    // Saldo sin distribuir (ingresos - gastos - lo que está distribuido)
    // Transferencias salientes de cuentas ARS del año (incluye conversiones a USD)
    const arsYearTransfersOut = accounts
        .filter(a => a.currency === 'ARS')
        .reduce((sum, a) => sum + (a.year_transfers_out || 0), 0)

    // Transferencias entrantes a cuentas ARS del año (desde otras cuentas)
    const arsYearTransfersIn = accounts
        .filter(a => a.currency === 'ARS')
        .reduce((sum, a) => sum + (a.year_transfers_in || 0), 0)

    // Ajustes de balance del año en cuentas ARS (arqueos de caja)
    const arsYearAdjustments = accounts
        .filter(a => a.currency === 'ARS')
        .reduce((sum, a) => sum + (a.year_adjustments || 0), 0)

    // El dinero "distribuido" en ARS incluye:
    // - Balance actual en cuentas ARS
    // - Plus transferencias salientes netas del año (dinero que fue a USD)
    // - Menos ajustes de balance (ya que no son ingresos reales)
    const totalDistributed = accountTotalARS + arsYearTransfersOut - arsYearTransfersIn - arsYearAdjustments

    const computedUnassignedBalance = yearTotals.income - yearTotals.expenses - totalDistributed
    const unassignedBalance = unassignedBalanceProp ?? computedUnassignedBalance

    if (chartLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-violet-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header con selector de año */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">Gráficos y Estadísticas</h2>
                    <p className="text-sm text-white/40">Visualiza la evolución financiera</p>
                </div>
                <div className="flex items-center gap-2 bg-white/[0.05] rounded-lg p-1">
                    <button
                        onClick={() => onYearChange(selectedYear - 1)}
                        className="p-2 hover:bg-white/[0.1] rounded transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 py-1 font-medium flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-white/40" />
                        {selectedYear}
                    </span>
                    <button
                        onClick={() => onYearChange(selectedYear + 1)}
                        className="p-2 hover:bg-white/[0.1] rounded transition-colors"
                        disabled={selectedYear >= new Date().getFullYear()}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {/* Cards de resumen del año */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                        <span className="text-white/60 text-sm">Ingresos {selectedYear}</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">
                        {formatFullCurrency(yearTotals.income)}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-red-500/10 to-red-600/5 border border-red-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="h-4 w-4 text-red-400" />
                        <span className="text-white/60 text-sm">Gastos {selectedYear}</span>
                    </div>
                    <p className="text-2xl font-bold text-red-400">
                        {formatFullCurrency(yearTotals.expenses)}
                    </p>
                </div>

                {/* Saldo sin distribuir */}
                {Math.abs(unassignedBalance) > 1 && (
                    <div className={cn(
                        "border rounded-xl p-5",
                        unassignedBalance > 0
                            ? "bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30"
                            : "bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/30"
                    )}>
                        <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className={cn(
                                "h-4 w-4",
                                unassignedBalance > 0 ? "text-amber-400" : "text-red-400"
                            )} />
                            <span className="text-white/60 text-sm">Sin distribuir</span>
                            <button
                                className="ml-auto"
                                title="Este monto representa dinero que aún no asignaste a ninguna cuenta. Ve a la pestaña Cuentas para distribuirlo."
                            >
                                <HelpCircle className="h-3.5 w-3.5 text-white/40" />
                            </button>
                        </div>
                        <p className={cn(
                            "text-2xl font-bold",
                            unassignedBalance > 0 ? "text-amber-400" : "text-red-400"
                        )}>
                            {formatFullCurrency(unassignedBalance)}
                        </p>
                        <p className="text-xs text-white/40 mt-1">Pendiente de asignar a cuentas</p>
                    </div>
                )}

                <div className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border border-violet-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-violet-400" />
                        <span className="text-white/60 text-sm">Reservas ARS</span>
                    </div>
                    <p className="text-2xl font-bold text-violet-400">
                        {formatFullCurrency(accountTotalARS)}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <Wallet className="h-4 w-4 text-blue-400" />
                        <span className="text-white/60 text-sm">Reservas USD</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">
                        {formatFullCurrency(accountTotalUSD, 'USD')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfico de barras - Evolución mensual */}
                <div className="lg:col-span-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-violet-500/20 rounded-lg">
                            <BarChart3 className="h-5 w-5 text-violet-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Evolución Mensual</h3>
                            <p className="text-sm text-white/40">Ingresos vs Gastos por mes</p>
                        </div>
                    </div>

                    {/* Leyenda */}
                    <div className="flex items-center gap-6 mb-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-emerald-400" />
                            <span className="text-sm text-white/60">Ingresos</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-red-400" />
                            <span className="text-sm text-white/60">Gastos</span>
                        </div>
                    </div>

                    {/* Gráfico de barras CSS */}
                    <div className="h-64 flex items-end gap-1">
                        {monthlyData.map((month, idx) => {
                            const incomeHeight = maxValue > 0 ? (month.total_income / maxValue) * 100 : 0
                            const expenseHeight = maxValue > 0 ? (month.total_expenses / maxValue) * 100 : 0
                            const currentMonth = new Date().getMonth() + 1

                            return (
                                <div
                                    key={month.month}
                                    className="flex-1 flex flex-col items-center gap-1"
                                >
                                    <div className="w-full flex items-end justify-center gap-0.5 h-52">
                                        {/* Barra de ingresos */}
                                        <div
                                            className={cn(
                                                "w-1/3 bg-emerald-400/80 rounded-t transition-all duration-500",
                                                month.month > currentMonth && selectedYear === new Date().getFullYear() && "opacity-30"
                                            )}
                                            style={{ height: `${incomeHeight}%` }}
                                            title={`Ingresos: ${formatFullCurrency(month.total_income)}`}
                                        />
                                        {/* Barra de gastos */}
                                        <div
                                            className={cn(
                                                "w-1/3 bg-red-400/80 rounded-t transition-all duration-500",
                                                month.month > currentMonth && selectedYear === new Date().getFullYear() && "opacity-30"
                                            )}
                                            style={{ height: `${expenseHeight}%` }}
                                            title={`Gastos: ${formatFullCurrency(month.total_expenses)}`}
                                        />
                                    </div>
                                    <span className={cn(
                                        "text-xs",
                                        month.month === currentMonth && selectedYear === new Date().getFullYear()
                                            ? "text-violet-400 font-semibold"
                                            : "text-white/40"
                                    )}>
                                        {month.month_name}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* Distribución de gastos */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-pink-500/20 rounded-lg">
                            <PieChart className="h-5 w-5 text-pink-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Distribución de Gastos</h3>
                            <p className="text-sm text-white/40">Por categoría</p>
                        </div>
                    </div>

                    {expenseDistribution.length === 0 ? (
                        <div className="text-center text-white/40 py-12">
                            No hay gastos registrados
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Pie chart visual (simplificado con barras de progreso) */}
                            <div className="space-y-3">
                                {expenseDistribution.slice(0, 6).map((cat) => (
                                    <div key={cat.category_id}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: cat.category_color }}
                                                />
                                                <span className="text-sm text-white">{cat.category_name}</span>
                                            </div>
                                            <span className="text-sm text-white/60">{cat.percentage}%</span>
                                        </div>
                                        <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${cat.percentage}%`,
                                                    backgroundColor: cat.category_color
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Lista detallada */}
                            <div className="pt-4 border-t border-white/[0.06] space-y-2">
                                {expenseDistribution.map((cat) => (
                                    <div
                                        key={cat.category_id}
                                        className="flex items-center justify-between py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: cat.category_color }}
                                            />
                                            <span className="text-sm text-white/80">{cat.category_name}</span>
                                            <span className="text-xs text-white/40">
                                                ({cat.expense_count} gastos)
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-white">
                                            {formatFullCurrency(cat.total_amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Balance por cuenta */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-cyan-500/20 rounded-lg">
                        <Wallet className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-white">Balance por Cuenta</h3>
                        <p className="text-sm text-white/40">Distribución actual del dinero</p>
                    </div>
                </div>

                {accounts.length === 0 && Math.abs(unassignedBalance) <= 1 ? (
                    <div className="text-center text-white/40 py-8">
                        No hay cuentas registradas
                    </div>
                ) : (
                    <div className="space-y-3">
                        {/* Saldo sin distribuir primero */}
                        {Math.abs(unassignedBalance) > 1 && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                                        <span className="text-sm text-white">Sin distribuir</span>
                                        <span className="text-xs text-amber-400/80 px-1.5 py-0.5 bg-amber-500/10 rounded border border-amber-500/20">
                                            Pendiente
                                        </span>
                                    </div>
                                    <span className={cn(
                                        "text-sm font-medium",
                                        unassignedBalance > 0 ? "text-amber-400" : "text-red-400"
                                    )}>
                                        {formatFullCurrency(unassignedBalance)}
                                    </span>
                                </div>
                                <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500 bg-amber-500/60"
                                        style={{
                                            width: `${Math.min(Math.abs(unassignedBalance) / (Math.abs(unassignedBalance) + accountTotalARS) * 100, 100)}%`
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Cuentas reales */}
                        {accounts.map((account) => {
                            const totalForCurrency = account.currency === 'ARS' ? accountTotalARS : accountTotalUSD
                            const percentage = totalForCurrency > 0 ? (account.current_balance / totalForCurrency) * 100 : 0

                            return (
                                <div key={account.id}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: account.color }}
                                            />
                                            <span className="text-sm text-white">{account.name}</span>
                                            <span className="text-xs text-white/40 px-1.5 py-0.5 bg-white/[0.05] rounded">
                                                {account.currency}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-white">
                                            {formatFullCurrency(account.current_balance, account.currency)}
                                        </span>
                                    </div>
                                    <div className="h-3 bg-white/[0.05] rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${Math.min(percentage, 100)}%`,
                                                backgroundColor: account.color
                                            }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
