"use client"

import { useState, useMemo } from "react"
import { Sparkles, Plus, Edit2, Trash2, X, Check, Loader2, ExternalLink, ShoppingCart, Filter, DollarSign, Camera, Laptop, Monitor, Package } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { FutureInvestment, FutureInvestmentInsert, FutureInvestmentUpdate, InvestmentPriority, InvestmentCategory, Currency } from "@/types/accounting"

interface AccountingInvestmentsViewProps {
    investments: FutureInvestment[]
    loading: boolean
    onCreateInvestment: (investment: FutureInvestmentInsert) => Promise<any>
    onUpdateInvestment: (id: string, updates: FutureInvestmentUpdate) => Promise<boolean>
    onDeleteInvestment: (id: string) => Promise<boolean>
    onMarkAsPurchased: (id: string) => Promise<boolean>
    onRefresh: (includePurchased?: boolean) => void
}

const PRIORITY_CONFIG: Record<InvestmentPriority, { label: string; color: string; bgColor: string }> = {
    high: { label: 'Alta', color: 'text-red-400', bgColor: 'bg-red-400/20' },
    medium: { label: 'Media', color: 'text-yellow-400', bgColor: 'bg-yellow-400/20' },
    low: { label: 'Baja', color: 'text-green-400', bgColor: 'bg-green-400/20' },
}

const CATEGORY_CONFIG: Record<InvestmentCategory, { label: string; icon: any; color: string }> = {
    equipment: { label: 'Equipamiento', icon: Camera, color: '#3b82f6' },
    subscription: { label: 'Suscripción', icon: Monitor, color: '#8b5cf6' },
    accessory: { label: 'Accesorio', icon: Package, color: '#f59e0b' },
    software: { label: 'Software', icon: Laptop, color: '#10b981' },
    other: { label: 'Otro', icon: Sparkles, color: '#6b7280' },
}

export function AccountingInvestmentsView({
    investments,
    loading,
    onCreateInvestment,
    onUpdateInvestment,
    onDeleteInvestment,
    onMarkAsPurchased,
    onRefresh,
}: AccountingInvestmentsViewProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingInvestment, setEditingInvestment] = useState<FutureInvestment | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [purchaseConfirm, setPurchaseConfirm] = useState<string | null>(null)
    const [showPurchased, setShowPurchased] = useState(false)
    const [filterCategory, setFilterCategory] = useState<InvestmentCategory | 'all'>('all')
    const [filterPriority, setFilterPriority] = useState<InvestmentPriority | 'all'>('all')

    // Form state
    const [formName, setFormName] = useState("")
    const [formUrl, setFormUrl] = useState("")
    const [formPrice, setFormPrice] = useState("")
    const [formCurrency, setFormCurrency] = useState<Currency>("ARS")
    const [formPriority, setFormPriority] = useState<InvestmentPriority>("medium")
    const [formCategory, setFormCategory] = useState<InvestmentCategory>("equipment")
    const [formNotes, setFormNotes] = useState("")

    const resetForm = () => {
        setFormName("")
        setFormUrl("")
        setFormPrice("")
        setFormCurrency("ARS")
        setFormPriority("medium")
        setFormCategory("equipment")
        setFormNotes("")
        setEditingInvestment(null)
    }

    const openCreateModal = () => {
        resetForm()
        setIsModalOpen(true)
    }

    const openEditModal = (investment: FutureInvestment) => {
        setEditingInvestment(investment)
        setFormName(investment.name)
        setFormUrl(investment.url || "")
        setFormPrice(investment.estimated_price?.toString() || "")
        setFormCurrency(investment.currency)
        setFormPriority(investment.priority)
        setFormCategory(investment.category)
        setFormNotes(investment.notes || "")
        setIsModalOpen(true)
    }

    const handleSubmit = async () => {
        if (!formName.trim()) return

        setIsSubmitting(true)
        try {
            const investmentData: FutureInvestmentInsert = {
                name: formName.trim(),
                url: formUrl.trim() || null,
                estimated_price: formPrice ? parseFloat(formPrice) : null,
                currency: formCurrency,
                priority: formPriority,
                category: formCategory,
                notes: formNotes.trim() || null,
            }

            if (editingInvestment) {
                await onUpdateInvestment(editingInvestment.id, investmentData)
            } else {
                await onCreateInvestment(investmentData)
            }

            setIsModalOpen(false)
            resetForm()
            onRefresh(showPurchased)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        await onDeleteInvestment(id)
        setDeleteConfirm(null)
        onRefresh(showPurchased)
    }

    const handleMarkAsPurchased = async (id: string) => {
        await onMarkAsPurchased(id)
        setPurchaseConfirm(null)
        onRefresh(showPurchased)
    }

    const handleToggleShowPurchased = () => {
        const newValue = !showPurchased
        setShowPurchased(newValue)
        onRefresh(newValue)
    }

    // Filtered investments
    const filteredInvestments = useMemo(() => {
        return investments.filter(inv => {
            if (filterCategory !== 'all' && inv.category !== filterCategory) return false
            if (filterPriority !== 'all' && inv.priority !== filterPriority) return false
            return true
        })
    }, [investments, filterCategory, filterPriority])

    // Summary
    const summary = useMemo(() => {
        const pending = investments.filter(i => !i.is_purchased)
        return {
            totalARS: pending.filter(i => i.currency === 'ARS').reduce((sum, i) => sum + (i.estimated_price || 0), 0),
            totalUSD: pending.filter(i => i.currency === 'USD').reduce((sum, i) => sum + (i.estimated_price || 0), 0),
            countPending: pending.length,
            countByPriority: {
                high: pending.filter(i => i.priority === 'high').length,
                medium: pending.filter(i => i.priority === 'medium').length,
                low: pending.filter(i => i.priority === 'low').length,
            }
        }
    }, [investments])

    const formatMoney = (amount: number, currency: Currency) => {
        if (currency === 'USD') {
            return `US$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
        }
        return `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-amber-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Total Pendiente ARS
                    </div>
                    <p className="text-xl font-bold text-white">{formatMoney(summary.totalARS, 'ARS')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <DollarSign className="h-4 w-4" />
                        Total Pendiente USD
                    </div>
                    <p className="text-xl font-bold text-white">{formatMoney(summary.totalUSD, 'USD')}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        <Sparkles className="h-4 w-4" />
                        Items Pendientes
                    </div>
                    <p className="text-xl font-bold text-white">{summary.countPending}</p>
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white/40 text-sm mb-1">
                        Por Prioridad
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-red-400">{summary.countByPriority.high} alta</span>
                        <span className="text-yellow-400">{summary.countByPriority.medium} media</span>
                        <span className="text-green-400">{summary.countByPriority.low} baja</span>
                    </div>
                </div>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-lg font-semibold text-white">Futuras Inversiones</h2>
                    <p className="text-white/40 text-sm">Lista de deseos para equipamiento y servicios</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nueva Inversión
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-white/40" />
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value as InvestmentCategory | 'all')}
                        className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-amber-500"
                    >
                        <option value="all">Todas las categorías</option>
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                        ))}
                    </select>
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value as InvestmentPriority | 'all')}
                        className="px-3 py-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white outline-none focus:border-amber-500"
                    >
                        <option value="all">Todas las prioridades</option>
                        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                            <option key={key} value={key}>{config.label}</option>
                        ))}
                    </select>
                </div>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={showPurchased}
                        onChange={handleToggleShowPurchased}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-amber-500 focus:ring-amber-500 focus:ring-offset-0"
                    />
                    Mostrar comprados
                </label>
            </div>

            {/* Investments List */}
            <div className="space-y-3">
                {filteredInvestments.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                        {investments.length === 0
                            ? "No hay inversiones registradas. Agrega una para empezar."
                            : "No hay inversiones con los filtros seleccionados."
                        }
                    </div>
                ) : (
                    filteredInvestments.map((investment) => {
                        const categoryConfig = CATEGORY_CONFIG[investment.category]
                        const priorityConfig = PRIORITY_CONFIG[investment.priority]
                        const CategoryIcon = categoryConfig.icon

                        return (
                            <div
                                key={investment.id}
                                className={cn(
                                    "bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 hover:border-white/[0.1] transition-colors",
                                    investment.is_purchased && "opacity-60"
                                )}
                            >
                                <div className="flex items-start gap-4">
                                    {/* Icon */}
                                    <div
                                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                        style={{ backgroundColor: `${categoryConfig.color}20` }}
                                    >
                                        <CategoryIcon className="h-6 w-6" style={{ color: categoryConfig.color }} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className={cn(
                                                        "font-medium text-white",
                                                        investment.is_purchased && "line-through"
                                                    )}>
                                                        {investment.name}
                                                    </h3>
                                                    <span className={cn(
                                                        "text-xs px-2 py-0.5 rounded-full",
                                                        priorityConfig.bgColor,
                                                        priorityConfig.color
                                                    )}>
                                                        {priorityConfig.label}
                                                    </span>
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.05] text-white/60">
                                                        {categoryConfig.label}
                                                    </span>
                                                    {investment.is_purchased && (
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                                                            Comprado
                                                        </span>
                                                    )}
                                                </div>

                                                {investment.estimated_price && (
                                                    <p className="text-lg font-semibold text-amber-400 mt-1">
                                                        {formatMoney(investment.estimated_price, investment.currency)}
                                                    </p>
                                                )}

                                                {investment.notes && (
                                                    <p className="text-white/40 text-sm mt-1 line-clamp-2">{investment.notes}</p>
                                                )}

                                                {investment.url && (
                                                    <a
                                                        href={investment.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-2 transition-colors"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                        Ver enlace
                                                    </a>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                {!investment.is_purchased && (
                                                    <>
                                                        {purchaseConfirm === investment.id ? (
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    onClick={() => handleMarkAsPurchased(investment.id)}
                                                                    className="p-1.5 text-emerald-400 hover:bg-emerald-400/10 rounded-lg"
                                                                    title="Confirmar compra"
                                                                >
                                                                    <Check className="h-4 w-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => setPurchaseConfirm(null)}
                                                                    className="p-1.5 text-white/40 hover:bg-white/[0.05] rounded-lg"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => setPurchaseConfirm(investment.id)}
                                                                className="p-1.5 text-white/40 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors"
                                                                title="Marcar como comprado"
                                                            >
                                                                <ShoppingCart className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => openEditModal(investment)}
                                                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                {deleteConfirm === investment.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleDelete(investment.id)}
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
                                                        onClick={() => setDeleteConfirm(investment.id)}
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

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-lg p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingInvestment ? 'Editar Inversión' : 'Nueva Inversión'}
                        </h2>

                        <div className="space-y-4">
                            {/* Nombre */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Nombre *</label>
                                <input
                                    type="text"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="Ej: DJI Mini 4 Pro"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>

                            {/* URL */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Link de compra</label>
                                <input
                                    type="url"
                                    value={formUrl}
                                    onChange={(e) => setFormUrl(e.target.value)}
                                    placeholder="https://..."
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>

                            {/* Precio y Moneda */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Precio estimado</label>
                                    <input
                                        type="number"
                                        value={formPrice}
                                        onChange={(e) => setFormPrice(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-amber-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Moneda</label>
                                    <select
                                        value={formCurrency}
                                        onChange={(e) => setFormCurrency(e.target.value as Currency)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-amber-500 transition-colors"
                                    >
                                        <option value="ARS">ARS (Pesos)</option>
                                        <option value="USD">USD (Dólares)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Categoría y Prioridad */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Categoría</label>
                                    <select
                                        value={formCategory}
                                        onChange={(e) => setFormCategory(e.target.value as InvestmentCategory)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-amber-500 transition-colors"
                                    >
                                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                                            <option key={key} value={key}>{config.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Prioridad</label>
                                    <select
                                        value={formPriority}
                                        onChange={(e) => setFormPriority(e.target.value as InvestmentPriority)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-amber-500 transition-colors"
                                    >
                                        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                                            <option key={key} value={key}>{config.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Notas</label>
                                <textarea
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="Descripción, especificaciones, razones para comprar..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-amber-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={!formName.trim() || isSubmitting}
                                className="w-full mt-2 px-4 py-3 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    editingInvestment ? "Guardar Cambios" : "Agregar Inversión"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
