"use client"

import { useState, useMemo } from "react"
import { Calculator, CreditCard, Receipt, Tags, BarChart3, Wallet, Sparkles, History } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { useAccounting } from "@/lib/sistema/hooks/useAccounting"
import { AccountingPaymentsView } from "./accounting-payments-view"
import { AccountingExpensesView } from "./accounting-expenses-view"
import { AccountingCategoriesView } from "./accounting-categories-view"
import { AccountingAccountsView } from "./accounting-accounts-view"
import { AccountingChartsView } from "./accounting-charts-view"
import { AccountingInvestmentsView } from "./accounting-investments-view"
import { AccountingHistoryView } from "./accounting-history-view"
import type { ProjectWithChildren } from "@/types/sistema"

interface AccountingViewProps {
    projects: ProjectWithChildren[]
}

type TabType = 'payments' | 'expenses' | 'accounts' | 'categories' | 'charts' | 'investments' | 'history'

export function AccountingView({ projects }: AccountingViewProps) {
    const [activeTab, setActiveTab] = useState<TabType>('accounts')
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
    const accounting = useAccounting()

    const tabs = [
        { id: 'accounts' as TabType, label: 'Cuentas', icon: Wallet },
        { id: 'payments' as TabType, label: 'Pagos', icon: CreditCard },
        { id: 'expenses' as TabType, label: 'Gastos', icon: Receipt },
        { id: 'investments' as TabType, label: 'Inversiones', icon: Sparkles },
        { id: 'history' as TabType, label: 'Historial', icon: History },
        { id: 'categories' as TabType, label: 'Categorías', icon: Tags },
        { id: 'charts' as TabType, label: 'Gráficos', icon: BarChart3 },
    ]

    // Handler para cambiar año y refrescar datos
    const handleYearChange = (year: number) => {
        setSelectedYear(year)
        accounting.fetchMonthlyChartData(year)
        accounting.fetchExpenseDistribution(year)
        accounting.fetchSummary(year)
    }

    // Calcular saldo sin distribuir
    const unassignedBalance = useMemo(() => {
        // Total de ingresos - gastos del año actual
        const yearTotals = accounting.monthlyChartData.reduce((acc, d) => ({
            income: acc.income + (d.total_income || 0),
            expenses: acc.expenses + (d.total_expenses || 0),
        }), { income: 0, expenses: 0 })

        // Total en cuentas ARS (balance actual)
        const accountTotalARS = accounting.accounts
            .filter(a => a.currency === 'ARS')
            .reduce((sum, a) => sum + (a.current_balance || 0), 0)

        // Transferencias salientes de cuentas ARS del año (incluye conversiones a USD)
        const arsYearTransfersOut = accounting.accounts
            .filter(a => a.currency === 'ARS')
            .reduce((sum, a) => sum + (a.year_transfers_out || 0), 0)

        // Transferencias entrantes a cuentas ARS del año (desde otras cuentas)
        const arsYearTransfersIn = accounting.accounts
            .filter(a => a.currency === 'ARS')
            .reduce((sum, a) => sum + (a.year_transfers_in || 0), 0)

        // Ajustes de balance del año en cuentas ARS (arqueos de caja)
        const arsYearAdjustments = accounting.accounts
            .filter(a => a.currency === 'ARS')
            .reduce((sum, a) => sum + (a.year_adjustments || 0), 0)

        // El dinero "distribuido" en ARS incluye:
        // - Balance actual en cuentas ARS
        // - Plus transferencias salientes netas del año (dinero que fue a USD)
        // - Menos ajustes de balance (ya que no son ingresos reales)
        const totalDistributed = accountTotalARS + arsYearTransfersOut - arsYearTransfersIn - arsYearAdjustments

        return yearTotals.income - yearTotals.expenses - totalDistributed
    }, [accounting.monthlyChartData, accounting.accounts])

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] text-white">
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-white/[0.06]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                            <Calculator className="h-6 w-6 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Contabilidad</h1>
                            <p className="text-white/40 text-sm">Gestión de cuentas, pagos y gastos</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white/[0.03] p-1 rounded-lg w-full sm:w-fit overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                                activeTab === tab.id
                                    ? "bg-white/[0.1] text-white"
                                    : "text-white/50 hover:text-white/80"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'accounts' && (
                    <AccountingAccountsView
                        accounts={accounting.accounts}
                        loading={accounting.accountsLoading}
                        unassignedBalance={unassignedBalance}
                        onCreateAccount={accounting.createAccount}
                        onUpdateAccount={accounting.updateAccount}
                        onDeleteAccount={accounting.deleteAccount}
                        onCreateTransfer={accounting.createTransfer}
                        onCreateBalanceAdjustment={accounting.createBalanceAdjustment}
                        onFetchMovements={accounting.fetchAccountMovements}
                        onRefresh={() => {
                            accounting.fetchAccounts()
                            accounting.fetchTransfers()
                            accounting.fetchMonthlyChartData(selectedYear)
                        }}
                    />
                )}
                {activeTab === 'payments' && (
                    <AccountingPaymentsView
                        payments={accounting.payments}
                        loading={accounting.paymentsLoading}
                        projects={projects}
                        accounts={accounting.accounts}
                        onCreatePayment={accounting.createPayment}
                        onUpdatePayment={accounting.updatePayment}
                        onDeletePayment={accounting.deletePayment}
                        onRefresh={() => {
                            accounting.fetchPayments()
                            accounting.fetchAccounts()
                        }}
                    />
                )}
                {activeTab === 'expenses' && (
                    <AccountingExpensesView
                        expenses={accounting.expenses}
                        loading={accounting.expensesLoading}
                        categories={accounting.categories}
                        subcategories={accounting.subcategories}
                        accounts={accounting.accounts}
                        onCreateExpense={accounting.createExpense}
                        onUpdateExpense={accounting.updateExpense}
                        onDeleteExpense={accounting.deleteExpense}
                        onUploadReceipt={accounting.uploadReceipt}
                        onRefresh={() => {
                            accounting.fetchExpenses()
                            accounting.fetchAccounts()
                        }}
                    />
                )}
                {activeTab === 'categories' && (
                    <AccountingCategoriesView
                        categories={accounting.categories}
                        loading={accounting.categoriesLoading}
                        subcategories={accounting.subcategories}
                        onCreateCategory={accounting.createCategory}
                        onUpdateCategory={accounting.updateCategory}
                        onDeleteCategory={accounting.deleteCategory}
                        onCreateSubcategory={accounting.createSubcategory}
                        onDeleteSubcategory={accounting.deleteSubcategory}
                        onRefresh={() => {
                            accounting.fetchCategories()
                            accounting.fetchSubcategories()
                        }}
                    />
                )}
                {activeTab === 'investments' && (
                    <AccountingInvestmentsView
                        investments={accounting.investments}
                        loading={accounting.investmentsLoading}
                        onCreateInvestment={accounting.createInvestment}
                        onUpdateInvestment={accounting.updateInvestment}
                        onDeleteInvestment={accounting.deleteInvestment}
                        onMarkAsPurchased={accounting.markInvestmentAsPurchased}
                        onRefresh={accounting.fetchInvestments}
                    />
                )}
                {activeTab === 'history' && (
                    <AccountingHistoryView
                        history={accounting.history}
                        loading={accounting.historyLoading}
                        summary={accounting.historySummary}
                        accounts={accounting.accounts}
                        onFetchHistory={accounting.fetchHistory}
                        onFetchSummary={accounting.fetchHistorySummary}
                    />
                )}
                {activeTab === 'charts' && (
                    <AccountingChartsView
                        monthlyData={accounting.monthlyChartData}
                        expenseDistribution={accounting.expenseDistribution}
                        accounts={accounting.accounts}
                        chartLoading={accounting.chartLoading}
                        selectedYear={selectedYear}
                        onYearChange={handleYearChange}
                    />
                )}
            </div>
        </div>
    )
}
