"use client"

import { useState, useEffect } from "react"
import {
    HandCoins,
    Plus,
    Edit2,
    Trash2,
    X,
    Check,
    Loader2,
    ChevronDown,
    ChevronRight,
    DollarSign,
    User,
    Clock,
    CheckCircle2,
    AlertCircle,
    Wallet,
    Calendar,
    CreditCard,
    ArrowDownLeft,
    Banknote
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type {
    PartnerContribution,
    PartnerContributionInsert,
    PartnerContributionUpdate,
    ContributionRepayment,
    ContributionRepaymentInsert,
    ContributionsTotals,
    Account,
    Currency,
    ContributionStatus,
    RepaymentType
} from "@/types/accounting"

interface AccountingContributionsViewProps {
    contributions: PartnerContribution[]
    loading: boolean
    totals: ContributionsTotals | null
    accounts: Account[]
    onFetchContributions: (status?: ContributionStatus, partnerName?: string) => void
    onCreateContribution: (contribution: PartnerContributionInsert) => Promise<any>
    onUpdateContribution: (id: string, updates: PartnerContributionUpdate) => Promise<boolean>
    onDeleteContribution: (id: string) => Promise<boolean>
    onFetchRepayments: (contributionId: string) => Promise<ContributionRepayment[]>
    onCreateRepayment: (repayment: ContributionRepaymentInsert) => Promise<any>
    onDeleteRepayment: (id: string) => Promise<boolean>
    onRefresh: () => void
}

const STATUS_CONFIG: Record<ContributionStatus, { label: string; color: string; bgColor: string; icon: any }> = {
    pending: { label: 'Pendiente', color: 'text-amber-400', bgColor: 'bg-amber-400/20', icon: Clock },
    partial: { label: 'Parcial', color: 'text-blue-400', bgColor: 'bg-blue-400/20', icon: AlertCircle },
    completed: { label: 'Completado', color: 'text-emerald-400', bgColor: 'bg-emerald-400/20', icon: CheckCircle2 },
}

const REPAYMENT_TYPE_CONFIG: Record<RepaymentType, { label: string; icon: any }> = {
    salary_deduction: { label: 'Descuento de sueldo', icon: Banknote },
    manual_payment: { label: 'Pago manual', icon: CreditCard },
    transfer: { label: 'Transferencia', icon: ArrowDownLeft },
    other: { label: 'Otro', icon: Wallet },
}

export function AccountingContributionsView({
    contributions,
    loading,
    totals,
    accounts,
    onFetchContributions,
    onCreateContribution,
    onUpdateContribution,
    onDeleteContribution,
    onFetchRepayments,
    onCreateRepayment,
    onDeleteRepayment,
    onRefresh,
}: AccountingContributionsViewProps) {
    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingContribution, setEditingContribution] = useState<PartnerContribution | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    // Repayment modal states
    const [selectedContribution, setSelectedContribution] = useState<PartnerContribution | null>(null)
    const [repayments, setRepayments] = useState<ContributionRepayment[]>([])
    const [repaymentsLoading, setRepaymentsLoading] = useState(false)
    const [showRepaymentForm, setShowRepaymentForm] = useState(false)
    const [deleteRepaymentConfirm, setDeleteRepaymentConfirm] = useState<string | null>(null)

    // Filters
    const [filterStatus, setFilterStatus] = useState<ContributionStatus | 'all'>('all')
    const [filterPartner, setFilterPartner] = useState('')

    // Contribution form state
    const [formPartnerName, setFormPartnerName] = useState("")
    const [formAmount, setFormAmount] = useState("")
    const [formCurrency, setFormCurrency] = useState<Currency>("ARS")
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
    const [formAccountId, setFormAccountId] = useState("")
    const [formNotes, setFormNotes] = useState("")

    // Repayment form state
    const [repaymentAmount, setRepaymentAmount] = useState("")
    const [repaymentDate, setRepaymentDate] = useState(new Date().toISOString().split('T')[0])
    const [repaymentType, setRepaymentType] = useState<RepaymentType>("salary_deduction")
    const [repaymentAccountId, setRepaymentAccountId] = useState("")
    const [repaymentNotes, setRepaymentNotes] = useState("")

    // Fetch with filters
    useEffect(() => {
        onFetchContributions(
            filterStatus !== 'all' ? filterStatus : undefined,
            filterPartner || undefined
        )
    }, [filterStatus, filterPartner])

    const resetContributionForm = () => {
        setFormPartnerName("")
        setFormAmount("")
        setFormCurrency("ARS")
        setFormDate(new Date().toISOString().split('T')[0])
        setFormAccountId("")
        setFormNotes("")
        setEditingContribution(null)
    }

    const resetRepaymentForm = () => {
        setRepaymentAmount("")
        setRepaymentDate(new Date().toISOString().split('T')[0])
        setRepaymentType("salary_deduction")
        setRepaymentAccountId("")
        setRepaymentNotes("")
        setShowRepaymentForm(false)
    }

    const openCreateModal = () => {
        resetContributionForm()
        setIsModalOpen(true)
    }

    const openEditModal = (contribution: PartnerContribution) => {
        setEditingContribution(contribution)
        setFormPartnerName(contribution.partner_name)
        setFormAmount(contribution.amount.toString())
        setFormCurrency(contribution.currency)
        setFormDate(contribution.date)
        setFormAccountId(contribution.account_id || "")
        setFormNotes(contribution.notes || "")
        setIsModalOpen(true)
    }

    const openRepaymentModal = async (contribution: PartnerContribution) => {
        setSelectedContribution(contribution)
        setRepaymentsLoading(true)
        const data = await onFetchRepayments(contribution.id)
        setRepayments(data)
        setRepaymentsLoading(false)
    }

    const handleSubmitContribution = async () => {
        if (!formPartnerName.trim() || !formAmount) return

        setIsSubmitting(true)
        try {
            const contributionData: PartnerContributionInsert = {
                partner_name: formPartnerName.trim(),
                amount: parseFloat(formAmount),
                currency: formCurrency,
                date: formDate,
                account_id: formAccountId || null,
                notes: formNotes.trim() || null,
            }

            if (editingContribution) {
                await onUpdateContribution(editingContribution.id, contributionData)
            } else {
                await onCreateContribution(contributionData)
            }

            setIsModalOpen(false)
            resetContributionForm()
            onRefresh()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteContribution = async (id: string) => {
        await onDeleteContribution(id)
        setDeleteConfirm(null)
        onRefresh()
    }

    const handleSubmitRepayment = async () => {
        if (!selectedContribution || !repaymentAmount) return

        setIsSubmitting(true)
        try {
            await onCreateRepayment({
                contribution_id: selectedContribution.id,
                amount: parseFloat(repaymentAmount),
                date: repaymentDate,
                repayment_type: repaymentType,
                account_id: repaymentAccountId || null,
                notes: repaymentNotes.trim() || null,
            })

            resetRepaymentForm()
            // Refresh repayments
            const data = await onFetchRepayments(selectedContribution.id)
            setRepayments(data)
            onRefresh()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDeleteRepayment = async (id: string) => {
        await onDeleteRepayment(id)
        setDeleteRepaymentConfirm(null)
        if (selectedContribution) {
            const data = await onFetchRepayments(selectedContribution.id)
            setRepayments(data)
        }
        onRefresh()
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
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    // Get unique partner names for suggestions
    const uniquePartners = [...new Set(contributions.map(c => c.partner_name))]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-cyan-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <HandCoins className="h-4 w-4 text-cyan-400" />
                        Aportes Pendientes ARS
                    </div>
                    <p className="text-xl font-bold text-cyan-400">{formatMoney(totals?.total_pending_ars, 'ARS')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <HandCoins className="h-4 w-4 text-cyan-400" />
                        Aportes Pendientes USD
                    </div>
                    <p className="text-xl font-bold text-cyan-400">{formatMoney(totals?.total_pending_usd, 'USD')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        Total Devuelto ARS
                    </div>
                    <p className="text-xl font-bold text-emerald-400">{formatMoney(totals?.total_repaid_ars, 'ARS')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <User className="h-4 w-4" />
                        Socios / Aportes
                    </div>
                    <p className="text-xl font-bold text-white">
                        {totals?.unique_partners ?? 0} / {totals?.total_contributions ?? 0}
                    </p>
                </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Aportes de Socios</h2>
                    <p className="text-white/40 text-sm">Gestiona los aportes y sus devoluciones</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo Aporte
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value as ContributionStatus | 'all')}
                    className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-cyan-500"
                >
                    <option value="all">Todos los estados</option>
                    <option value="pending">Pendiente</option>
                    <option value="partial">Parcial</option>
                    <option value="completed">Completado</option>
                </select>
                <input
                    type="text"
                    value={filterPartner}
                    onChange={(e) => setFilterPartner(e.target.value)}
                    placeholder="Buscar por socio..."
                    className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white placeholder:text-white/40 outline-none focus:border-cyan-500"
                />
            </div>

            {/* Contributions List */}
            <div className="space-y-3">
                {contributions.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                        No hay aportes registrados.
                    </div>
                ) : (
                    contributions.map((contribution) => {
                        const statusConfig = STATUS_CONFIG[contribution.status]
                        const StatusIcon = statusConfig.icon
                        const progress = contribution.amount > 0
                            ? (contribution.amount_repaid / contribution.amount) * 100
                            : 0

                        return (
                            <div
                                key={contribution.id}
                                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.1] transition-colors"
                            >
                                <div className="flex items-start gap-4">
                                    {/* Icon */}
                                    <div className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                        statusConfig.bgColor
                                    )}>
                                        <StatusIcon className={cn("h-6 w-6", statusConfig.color)} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium text-white flex items-center gap-1.5">
                                                        <User className="h-4 w-4 text-white/40" />
                                                        {contribution.partner_name}
                                                    </span>
                                                    <span className={cn(
                                                        "text-xs px-2 py-0.5 rounded-full",
                                                        statusConfig.bgColor,
                                                        statusConfig.color
                                                    )}>
                                                        {statusConfig.label}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4 mt-2">
                                                    <div>
                                                        <p className="text-xs text-white/40">Aporte</p>
                                                        <p className="text-lg font-semibold text-white">
                                                            {formatMoney(contribution.amount, contribution.currency)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-white/40">Devuelto</p>
                                                        <p className="text-lg font-semibold text-emerald-400">
                                                            {formatMoney(contribution.amount_repaid, contribution.currency)}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs text-white/40">Pendiente</p>
                                                        <p className="text-lg font-semibold text-amber-400">
                                                            {formatMoney(contribution.amount_pending, contribution.currency)}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Progress bar */}
                                                <div className="mt-3 w-full max-w-xs">
                                                    <div className="h-2 bg-white/[0.1] rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
                                                            style={{ width: `${Math.min(progress, 100)}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-white/40 mt-1">{progress.toFixed(0)}% devuelto</p>
                                                </div>

                                                <div className="flex items-center gap-3 mt-2 text-sm text-white/40">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        {formatDate(contribution.date)}
                                                    </span>
                                                    {contribution.account_name && (
                                                        <span className="flex items-center gap-1">
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: contribution.account_color || '#6b7280' }}
                                                            />
                                                            {contribution.account_name}
                                                        </span>
                                                    )}
                                                    {contribution.repayment_count > 0 && (
                                                        <span>{contribution.repayment_count} devoluciones</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button
                                                    onClick={() => openRepaymentModal(contribution)}
                                                    className="px-3 py-1.5 text-sm text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-colors flex items-center gap-1"
                                                >
                                                    <DollarSign className="h-4 w-4" />
                                                    Devoluciones
                                                </button>
                                                <button
                                                    onClick={() => openEditModal(contribution)}
                                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                {deleteConfirm === contribution.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleDeleteContribution(contribution.id)}
                                                            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm(null)}
                                                            className="p-1.5 text-white/40 hover:bg-white/[0.05] rounded-lg"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setDeleteConfirm(contribution.id)}
                                                        className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

            {/* Contribution Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-lg p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingContribution ? 'Editar Aporte' : 'Nuevo Aporte'}
                        </h2>

                        <div className="space-y-4">
                            {/* Partner Name */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Socio *</label>
                                <input
                                    type="text"
                                    value={formPartnerName}
                                    onChange={(e) => setFormPartnerName(e.target.value)}
                                    placeholder="Nombre del socio"
                                    list="partner-suggestions"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-cyan-500 transition-colors"
                                />
                                <datalist id="partner-suggestions">
                                    {uniquePartners.map(name => (
                                        <option key={name} value={name} />
                                    ))}
                                </datalist>
                            </div>

                            {/* Amount and Currency */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Monto *</label>
                                    <input
                                        type="number"
                                        value={formAmount}
                                        onChange={(e) => setFormAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-cyan-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Moneda</label>
                                    <select
                                        value={formCurrency}
                                        onChange={(e) => setFormCurrency(e.target.value as Currency)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-cyan-500 transition-colors"
                                    >
                                        <option value="ARS">ARS (Pesos)</option>
                                        <option value="USD">USD (Dólares)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Date and Account */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Fecha</label>
                                    <input
                                        type="date"
                                        value={formDate}
                                        onChange={(e) => setFormDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-cyan-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Cuenta destino</label>
                                    <select
                                        value={formAccountId}
                                        onChange={(e) => setFormAccountId(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-cyan-500 transition-colors"
                                    >
                                        <option value="">Sin asignar</option>
                                        {accounts.filter(a => a.currency === formCurrency).map(account => (
                                            <option key={account.id} value={account.id}>{account.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Notas</label>
                                <textarea
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="Notas opcionales..."
                                    rows={2}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-cyan-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmitContribution}
                                disabled={!formPartnerName.trim() || !formAmount || isSubmitting}
                                className="w-full mt-2 px-4 py-3 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    editingContribution ? "Guardar Cambios" : "Registrar Aporte"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Repayments Modal */}
            {selectedContribution && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => {
                            setSelectedContribution(null)
                            resetRepaymentForm()
                        }}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-2xl p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-y-auto max-h-[90vh]">
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-white">Devoluciones</h2>
                                <p className="text-white/40 text-sm">
                                    {selectedContribution.partner_name} - {formatMoney(selectedContribution.amount_pending, selectedContribution.currency)} pendiente
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedContribution(null)
                                    resetRepaymentForm()
                                }}
                                className="p-2 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Progress */}
                        <div className="mb-6 p-4 bg-white/[0.03] rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-white/60">Progreso de devolución</span>
                                <span className="text-sm font-medium text-white">
                                    {formatMoney(selectedContribution.amount_repaid, selectedContribution.currency)} / {formatMoney(selectedContribution.amount, selectedContribution.currency)}
                                </span>
                            </div>
                            <div className="h-3 bg-white/[0.1] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full transition-all"
                                    style={{ width: `${Math.min((selectedContribution.amount_repaid / selectedContribution.amount) * 100, 100)}%` }}
                                />
                            </div>
                        </div>

                        {/* Add repayment button */}
                        {!showRepaymentForm && selectedContribution.status !== 'completed' && (
                            <button
                                onClick={() => setShowRepaymentForm(true)}
                                className="w-full mb-4 px-4 py-3 border border-dashed border-white/20 text-white/60 hover:text-white hover:border-cyan-500 rounded-lg flex items-center justify-center gap-2 transition-colors"
                            >
                                <Plus className="h-4 w-4" />
                                Agregar devolución
                            </button>
                        )}

                        {/* Repayment form */}
                        {showRepaymentForm && (
                            <div className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                                <h3 className="font-medium text-white mb-4">Nueva devolución</h3>
                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm text-white/60 mb-1">Monto *</label>
                                        <input
                                            type="number"
                                            value={repaymentAmount}
                                            onChange={(e) => setRepaymentAmount(e.target.value)}
                                            placeholder={`Max: ${selectedContribution.amount_pending}`}
                                            max={selectedContribution.amount_pending}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-white/60 mb-1">Fecha</label>
                                        <input
                                            type="date"
                                            value={repaymentDate}
                                            onChange={(e) => setRepaymentDate(e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-cyan-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-white/60 mb-1">Tipo</label>
                                        <select
                                            value={repaymentType}
                                            onChange={(e) => setRepaymentType(e.target.value as RepaymentType)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-cyan-500"
                                        >
                                            {Object.entries(REPAYMENT_TYPE_CONFIG).map(([key, config]) => (
                                                <option key={key} value={key}>{config.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm text-white/60 mb-1">Cuenta origen</label>
                                        <select
                                            value={repaymentAccountId}
                                            onChange={(e) => setRepaymentAccountId(e.target.value)}
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm outline-none focus:border-cyan-500"
                                        >
                                            <option value="">Sin asignar</option>
                                            {accounts.filter(a => a.currency === selectedContribution.currency).map(account => (
                                                <option key={account.id} value={account.id}>{account.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <input
                                    type="text"
                                    value={repaymentNotes}
                                    onChange={(e) => setRepaymentNotes(e.target.value)}
                                    placeholder="Notas opcionales..."
                                    className="w-full px-3 py-2 mb-4 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder:text-white/40 outline-none focus:border-cyan-500"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSubmitRepayment}
                                        disabled={!repaymentAmount || isSubmitting}
                                        className="flex-1 px-4 py-2 bg-cyan-500 text-white font-medium rounded-lg hover:bg-cyan-600 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar'}
                                    </button>
                                    <button
                                        onClick={resetRepaymentForm}
                                        className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/[0.05] rounded-lg"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Repayments list */}
                        <div className="space-y-2">
                            {repaymentsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-white/40" />
                                </div>
                            ) : repayments.length === 0 ? (
                                <div className="text-center py-8 text-white/40">
                                    No hay devoluciones registradas
                                </div>
                            ) : (
                                repayments.map((repayment) => {
                                    const typeConfig = REPAYMENT_TYPE_CONFIG[repayment.repayment_type]
                                    const TypeIcon = typeConfig.icon

                                    return (
                                        <div
                                            key={repayment.id}
                                            className="flex items-center justify-between p-3 bg-white/[0.03] rounded-lg group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-emerald-400/20 flex items-center justify-center">
                                                    <TypeIcon className="h-4 w-4 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-emerald-400">
                                                        {formatMoney(repayment.amount, selectedContribution.currency)}
                                                    </p>
                                                    <div className="flex items-center gap-2 text-xs text-white/40">
                                                        <span>{formatDate(repayment.date)}</span>
                                                        <span>•</span>
                                                        <span>{typeConfig.label}</span>
                                                        {repayment.account_name && (
                                                            <>
                                                                <span>•</span>
                                                                <span>{repayment.account_name}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {deleteRepaymentConfirm === repayment.id ? (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleDeleteRepayment(repayment.id)}
                                                        className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg"
                                                    >
                                                        <Check className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteRepaymentConfirm(null)}
                                                        className="p-1.5 text-white/40 hover:bg-white/[0.05] rounded-lg"
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setDeleteRepaymentConfirm(repayment.id)}
                                                    className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
