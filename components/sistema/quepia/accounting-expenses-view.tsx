"use client"

import { useState, useRef, useMemo } from "react"
import { Receipt, Search, Plus, Edit2, Trash2, Download, X, Check, Upload, ExternalLink, Loader2, Clock } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ExpenseWithCategory, ExpenseInsert, ExpenseUpdate, ExpenseCategory, ExpenseSubcategory, Account, Currency } from "@/types/accounting"

interface AccountingExpensesViewProps {
    expenses: ExpenseWithCategory[]
    loading: boolean
    categories: ExpenseCategory[]
    subcategories: ExpenseSubcategory[]
    accounts: Account[]
    onCreateExpense: (expense: ExpenseInsert) => Promise<any>
    onUpdateExpense: (id: string, updates: ExpenseUpdate) => Promise<boolean>
    onDeleteExpense: (id: string) => Promise<boolean>
    onUploadReceipt: (file: File, expenseId: string) => Promise<string | null>
    onRefresh: () => void
}

export function AccountingExpensesView({
    expenses,
    loading,
    categories,
    subcategories,
    accounts,
    onCreateExpense,
    onUpdateExpense,
    onDeleteExpense,
    onUploadReceipt,
    onRefresh,
}: AccountingExpensesViewProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [filterCategory, setFilterCategory] = useState<string | null>(null)
    const [filterStartDate, setFilterStartDate] = useState("")
    const [filterEndDate, setFilterEndDate] = useState("")
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingExpense, setEditingExpense] = useState<ExpenseWithCategory | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
    const [uploadingId, setUploadingId] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Form state
    const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
    const [formCategoryId, setFormCategoryId] = useState("")
    const [formDescription, setFormDescription] = useState("")
    const [formAmount, setFormAmount] = useState("")
    const [formCurrency, setFormCurrency] = useState<Currency>("ARS")
    const [formProvider, setFormProvider] = useState("")
    const [formNotes, setFormNotes] = useState("")
    const [formSubcategoryId, setFormSubcategoryId] = useState("")
    const [formAccountId, setFormAccountId] = useState("")

    // Filtered subcategories based on selected category
    const filteredSubcategories = useMemo(() => {
        return subcategories.filter(s => s.category_id === formCategoryId)
    }, [subcategories, formCategoryId])

    // Filter expenses
    const filteredExpenses = expenses.filter((e) => {
        if (searchTerm) {
            const search = searchTerm.toLowerCase()
            if (!e.description.toLowerCase().includes(search) &&
                !e.provider?.toLowerCase().includes(search) &&
                !e.category_name?.toLowerCase().includes(search)) {
                return false
            }
        }
        if (filterCategory && e.category_id !== filterCategory) return false
        if (filterStartDate && e.date < filterStartDate) return false
        if (filterEndDate && e.date > filterEndDate) return false
        return true
    })

    const resetForm = () => {
        setFormDate(new Date().toISOString().split('T')[0])
        setFormCategoryId("")
        setFormDescription("")
        setFormAmount("")
        setFormCurrency("ARS")
        setFormProvider("")
        setFormNotes("")
        setFormSubcategoryId("")
        setFormAccountId("")
        setEditingExpense(null)
    }

    const openCreateModal = () => {
        resetForm()
        setIsModalOpen(true)
    }

    const openEditModal = (expense: ExpenseWithCategory) => {
        setEditingExpense(expense)
        setFormDate(expense.date)
        setFormCategoryId(expense.category_id || "")
        setFormSubcategoryId(expense.subcategory_id || "")
        setFormAccountId(expense.account_id || "")
        setFormDescription(expense.description)
        setFormAmount(expense.amount.toString())
        setFormCurrency(expense.currency)
        setFormProvider(expense.provider || "")
        setFormNotes(expense.notes || "")
        setIsModalOpen(true)
    }

    const handleSubmit = async () => {
        if (!formDescription || !formAmount) return

        setIsSubmitting(true)
        try {
            const expenseData = {
                date: formDate,
                category_id: formCategoryId || null,
                subcategory_id: formSubcategoryId || null,
                account_id: formAccountId || null,
                description: formDescription,
                amount: parseFloat(formAmount),
                currency: formCurrency,
                provider: formProvider || null,
                notes: formNotes || null,
            }

            if (editingExpense) {
                await onUpdateExpense(editingExpense.id, expenseData)
            } else {
                await onCreateExpense(expenseData)
            }

            setIsModalOpen(false)
            resetForm()
            onRefresh()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        await onDeleteExpense(id)
        setDeleteConfirm(null)
        onRefresh()
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, expenseId: string) => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploadingId(expenseId)
        try {
            await onUploadReceipt(file, expenseId)
            onRefresh()
        } finally {
            setUploadingId(null)
        }
    }

    const formatCurrency = (amount: number, currency: string = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        }).format(amount)
    }

    // Export to CSV
    const exportToCSV = () => {
        const headers = ['Fecha', 'Categoría', 'Descripción', 'Monto', 'Moneda', 'Proveedor', 'Notas']
        const rows = filteredExpenses.map(e => [
            e.date,
            e.category_name || 'Sin categoría',
            e.description,
            e.amount,
            e.currency,
            e.provider || '',
            e.notes || ''
        ])

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `gastos_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-red-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Buscar gasto..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50 transition-colors"
                    />
                </div>

                <select
                    value={filterCategory || ""}
                    onChange={(e) => setFilterCategory(e.target.value || null)}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
                >
                    <option value="" className="bg-[#1a1a1a]">Todas las categorías</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id} className="bg-[#1a1a1a]">{cat.name}</option>
                    ))}
                </select>

                <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
                />

                <span className="text-white/40">-</span>

                <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-red-500/50"
                />

                <div className="flex-1" />

                <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-3 py-2 text-white/60 hover:text-white border border-white/[0.1] hover:border-white/20 rounded-lg text-sm transition-colors"
                >
                    <Download className="h-4 w-4" />
                    Exportar
                </button>

                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo Gasto
                </button>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/[0.06] overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-white/[0.02] border-b border-white/[0.06]">
                        <tr>
                            <th className="px-6 py-4 font-medium text-white/40">Fecha</th>
                            <th className="px-6 py-4 font-medium text-white/40">Categoría</th>
                            <th className="px-6 py-4 font-medium text-white/40">Descripción</th>
                            <th className="px-6 py-4 font-medium text-white/40">Monto</th>
                            <th className="px-6 py-4 font-medium text-white/40">Proveedor</th>
                            <th className="px-6 py-4 font-medium text-white/40">Comprobante</th>
                            <th className="px-6 py-4 font-medium text-white/40 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                        {filteredExpenses.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-white/40">
                                    No hay gastos registrados
                                </td>
                            </tr>
                        ) : (
                            filteredExpenses.map((expense) => {
                                const isFuture = new Date(expense.date + 'T12:00:00') > new Date(new Date().toDateString())
                                return (
                                    <tr key={expense.id} className={cn("hover:bg-white/[0.02] transition-colors", isFuture && "opacity-60")}>
                                        <td className="px-6 py-4 text-white/60 tabular-nums">
                                            <div className="flex items-center gap-2">
                                                {new Date(expense.date + 'T12:00:00').toLocaleDateString('es-AR')}
                                                {isFuture && (
                                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-amber-400 text-[10px] font-medium">
                                                        <Clock className="h-2.5 w-2.5" />
                                                        Futuro
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {expense.category_name ? (
                                                <span
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                                                    style={{
                                                        backgroundColor: `${expense.category_color}15`,
                                                        borderColor: `${expense.category_color}30`,
                                                        color: expense.category_color || '#fff'
                                                    }}
                                                >
                                                    {expense.category_name}
                                                </span>
                                            ) : (
                                                <span className="text-white/40 text-xs">Sin categoría</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-white/90 max-w-xs truncate">
                                            {expense.description}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "font-medium",
                                                expense.currency === 'USD' ? 'text-blue-400' : 'text-red-400'
                                            )}>
                                                {formatCurrency(expense.amount, expense.currency)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-white/60">
                                            {expense.provider || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {expense.receipt_url ? (
                                                <a
                                                    href={expense.receipt_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 text-xs"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    Ver
                                                </a>
                                            ) : (
                                                <label className="cursor-pointer">
                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf"
                                                        className="hidden"
                                                        onChange={(e) => handleFileUpload(e, expense.id)}
                                                    />
                                                    {uploadingId === expense.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin text-white/40" />
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-white/40 hover:text-white/60 text-xs">
                                                            <Upload className="h-3 w-3" />
                                                            Subir
                                                        </span>
                                                    )}
                                                </label>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openEditModal(expense)}
                                                    className="p-2 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                {deleteConfirm === expense.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleDelete(expense.id)}
                                                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteConfirm(null)}
                                                            className="p-2 text-white/40 hover:bg-white/[0.05] rounded-lg"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setDeleteConfirm(expense.id)}
                                                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] w-full h-[100svh] sm:h-auto sm:max-w-lg p-4 sm:p-6 border-0 sm:border sm:border-white/10 rounded-t-2xl sm:rounded-xl shadow-2xl sm:max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
                        </h2>

                        <div className="space-y-4">
                            {/* Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Fecha *</label>
                                <input
                                    type="date"
                                    value={formDate}
                                    onChange={(e) => setFormDate(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-red-500 transition-colors"
                                />
                            </div>

                            {/* Categoría */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Categoría</label>
                                <select
                                    value={formCategoryId}
                                    onChange={(e) => {
                                        setFormCategoryId(e.target.value)
                                        setFormSubcategoryId("") // Reset subcategory when category changes
                                    }}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-red-500 transition-colors"
                                >
                                    <option value="" className="bg-[#1a1a1a]">Sin categoría</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id} className="bg-[#1a1a1a]">{cat.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Subcategoría */}
                            {filteredSubcategories.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Subcategoría</label>
                                    <select
                                        value={formSubcategoryId}
                                        onChange={(e) => setFormSubcategoryId(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-red-500 transition-colors"
                                    >
                                        <option value="" className="bg-[#1a1a1a]">Sin subcategoría</option>
                                        {filteredSubcategories.map(sub => (
                                            <option key={sub.id} value={sub.id} className="bg-[#1a1a1a]">{sub.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Descripción */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Descripción *</label>
                                <input
                                    type="text"
                                    value={formDescription}
                                    onChange={(e) => setFormDescription(e.target.value)}
                                    placeholder="Ej: Suscripción mensual de Figma"
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-red-500 transition-colors"
                                />
                            </div>

                            {/* Monto y Moneda */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Monto *</label>
                                    <input
                                        type="number"
                                        value={formAmount}
                                        onChange={(e) => setFormAmount(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-red-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Moneda</label>
                                    <div className="flex gap-2">
                                        {(['ARS', 'USD'] as Currency[]).map((curr) => (
                                            <button
                                                key={curr}
                                                type="button"
                                                onClick={() => setFormCurrency(curr)}
                                                className={cn(
                                                    "flex-1 px-3 py-3 rounded-lg text-sm font-medium border transition-colors",
                                                    formCurrency === curr
                                                        ? curr === 'USD' ? "bg-blue-500/20 border-blue-500 text-blue-400" : "bg-red-500/20 border-red-500 text-red-400"
                                                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                                )}
                                            >
                                                {curr}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Proveedor */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Proveedor</label>
                                <input
                                    type="text"
                                    value={formProvider}
                                    onChange={(e) => setFormProvider(e.target.value)}
                                    placeholder="Ej: Figma Inc."
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-red-500 transition-colors"
                                />
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Notas</label>
                                <textarea
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="Notas adicionales..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-red-500 resize-none"
                                />
                            </div>

                            {/* Cuenta */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Cuenta de pago</label>
                                <select
                                    value={formAccountId}
                                    onChange={(e) => setFormAccountId(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-red-500 transition-colors"
                                >
                                    <option value="" className="bg-[#1a1a1a]">Sin asignar</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id} className="bg-[#1a1a1a]">
                                            {acc.name} ({acc.currency})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={!formDescription || !formAmount || isSubmitting}
                                className="w-full mt-2 px-4 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    editingExpense ? "Guardar Cambios" : "Crear Gasto"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
