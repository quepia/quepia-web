"use client"

import { useState } from "react"
import { CreditCard, Search, Plus, Edit2, Trash2, Calendar, Download, X, Check, Clock, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { ClientPaymentWithProject, ClientPaymentInsert, ClientPaymentUpdate, PaymentStatus, Currency, Account } from "@/types/accounting"
import type { ProjectWithChildren } from "@/types/sistema"

interface AccountingPaymentsViewProps {
    payments: ClientPaymentWithProject[]
    loading: boolean
    projects: ProjectWithChildren[]
    accounts: Account[]
    onCreatePayment: (payment: ClientPaymentInsert) => Promise<any>
    onUpdatePayment: (id: string, updates: ClientPaymentUpdate) => Promise<boolean>
    onDeletePayment: (id: string) => Promise<boolean>
    onRefresh: () => void
}

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string; icon: any }> = {
    pending: { label: 'Pendiente', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20', icon: Clock },
    paid: { label: 'Pagado', color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', icon: Check },
    overdue: { label: 'Vencido', color: 'text-red-400 bg-red-400/10 border-red-400/20', icon: AlertCircle },
    cancelled: { label: 'Cancelado', color: 'text-white/40 bg-white/5 border-white/10', icon: X },
}

export function AccountingPaymentsView({
    payments,
    loading,
    projects,
    accounts,
    onCreatePayment,
    onUpdatePayment,
    onDeletePayment,
    onRefresh,
}: AccountingPaymentsViewProps) {
    const [searchTerm, setSearchTerm] = useState("")
    const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear())
    const [filterMonth, setFilterMonth] = useState<number | null>(null)
    const [filterStatus, setFilterStatus] = useState<PaymentStatus | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingPayment, setEditingPayment] = useState<ClientPaymentWithProject | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    // Form state
    const [formProjectId, setFormProjectId] = useState("")
    const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1)
    const [formYear, setFormYear] = useState(new Date().getFullYear())
    const [formAmount, setFormAmount] = useState("")
    const [formCurrency, setFormCurrency] = useState<Currency>("ARS")
    const [formStatus, setFormStatus] = useState<PaymentStatus>("pending")
    const [formExpectedDate, setFormExpectedDate] = useState("")
    const [formPaymentDate, setFormPaymentDate] = useState("")
    const [formPaymentMethod, setFormPaymentMethod] = useState("")
    const [formInvoiceNumber, setFormInvoiceNumber] = useState("")
    const [formNotes, setFormNotes] = useState("")
    const [formAccountId, setFormAccountId] = useState("")

    // Flatten projects for select
    const flatProjects = flattenProjects(projects)

    // Filter payments
    const filteredPayments = payments.filter((p) => {
        if (searchTerm && !p.project_name?.toLowerCase().includes(searchTerm.toLowerCase())) return false
        if (filterYear && p.year !== filterYear) return false
        if (filterMonth && p.month !== filterMonth) return false
        if (filterStatus && p.status !== filterStatus) return false
        return true
    })

    const resetForm = () => {
        setFormProjectId("")
        setFormMonth(new Date().getMonth() + 1)
        setFormYear(new Date().getFullYear())
        setFormAmount("")
        setFormCurrency("ARS")
        setFormStatus("pending")
        setFormExpectedDate("")
        setFormPaymentDate("")
        setFormPaymentMethod("")
        setFormInvoiceNumber("")
        setFormNotes("")
        setFormAccountId("")
        setEditingPayment(null)
    }

    const openCreateModal = () => {
        resetForm()
        setIsModalOpen(true)
    }

    const openEditModal = (payment: ClientPaymentWithProject) => {
        setEditingPayment(payment)
        setFormProjectId(payment.project_id)
        setFormMonth(payment.month)
        setFormYear(payment.year)
        setFormAmount(payment.amount.toString())
        setFormCurrency(payment.currency)
        setFormStatus(payment.status)
        setFormExpectedDate(payment.expected_payment_date || "")
        setFormPaymentDate(payment.payment_date || "")
        setFormPaymentMethod(payment.payment_method || "")
        setFormInvoiceNumber(payment.invoice_number || "")
        setFormNotes(payment.notes || "")
        setFormAccountId(payment.account_id || "")
        setIsModalOpen(true)
    }

    const handleSubmit = async () => {
        if (!formProjectId || !formAmount) return

        setIsSubmitting(true)
        try {
            const paymentData = {
                project_id: formProjectId,
                account_id: formAccountId || null,
                month: formMonth,
                year: formYear,
                amount: parseFloat(formAmount),
                currency: formCurrency,
                status: formStatus,
                expected_payment_date: formExpectedDate || null,
                payment_date: formPaymentDate || null,
                payment_method: formPaymentMethod || null,
                invoice_number: formInvoiceNumber || null,
                notes: formNotes || null,
            }

            if (editingPayment) {
                await onUpdatePayment(editingPayment.id, paymentData)
            } else {
                await onCreatePayment(paymentData)
            }

            setIsModalOpen(false)
            resetForm()
            onRefresh()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleDelete = async (id: string) => {
        await onDeletePayment(id)
        setDeleteConfirm(null)
        onRefresh()
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
        const headers = ['Cliente', 'Mes', 'Año', 'Monto', 'Moneda', 'Estado', 'Fecha Esperada', 'Fecha Pago', 'Método', 'Factura', 'Notas']
        const rows = filteredPayments.map(p => [
            p.project_name,
            MONTHS[p.month - 1],
            p.year,
            p.amount,
            p.currency,
            STATUS_CONFIG[p.status].label,
            p.expected_payment_date || '',
            p.payment_date || '',
            p.payment_method || '',
            p.invoice_number || '',
            p.notes || ''
        ])

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `pagos_${filterYear}${filterMonth ? '_' + MONTHS[filterMonth - 1] : ''}.csv`
        a.click()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-emerald-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-6">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                    <input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                </div>

                <select
                    value={filterYear}
                    onChange={(e) => setFilterYear(parseInt(e.target.value))}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                >
                    {[2024, 2025, 2026].map(year => (
                        <option key={year} value={year} className="bg-[#1a1a1a]">{year}</option>
                    ))}
                </select>

                <select
                    value={filterMonth || ""}
                    onChange={(e) => setFilterMonth(e.target.value ? parseInt(e.target.value) : null)}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                >
                    <option value="" className="bg-[#1a1a1a]">Todos los meses</option>
                    {MONTHS.map((month, idx) => (
                        <option key={idx} value={idx + 1} className="bg-[#1a1a1a]">{month}</option>
                    ))}
                </select>

                <select
                    value={filterStatus || ""}
                    onChange={(e) => setFilterStatus(e.target.value as PaymentStatus || null)}
                    className="px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded-lg text-sm text-white focus:outline-none focus:border-emerald-500/50"
                >
                    <option value="" className="bg-[#1a1a1a]">Todos los estados</option>
                    {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                        <option key={key} value={key} className="bg-[#1a1a1a]">{config.label}</option>
                    ))}
                </select>

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
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                    <Plus className="h-4 w-4" />
                    Nuevo Pago
                </button>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-white/[0.02] border-b border-white/[0.06]">
                        <tr>
                            <th className="px-6 py-4 font-medium text-white/40">Cliente</th>
                            <th className="px-6 py-4 font-medium text-white/40">Período</th>
                            <th className="px-6 py-4 font-medium text-white/40">Monto</th>
                            <th className="px-6 py-4 font-medium text-white/40">Estado</th>
                            <th className="px-6 py-4 font-medium text-white/40">Fecha Esperada</th>
                            <th className="px-6 py-4 font-medium text-white/40">Fecha Pago</th>
                            <th className="px-6 py-4 font-medium text-white/40 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                        {filteredPayments.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-white/40">
                                    No hay pagos registrados
                                </td>
                            </tr>
                        ) : (
                            filteredPayments.map((payment) => {
                                const statusConfig = STATUS_CONFIG[payment.status]
                                const StatusIcon = statusConfig.icon
                                return (
                                    <tr key={payment.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-3 h-3 rounded-full"
                                                    style={{ backgroundColor: payment.project_color || '#6366f1' }}
                                                />
                                                <span className="font-medium text-white/90">{payment.project_name}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-white/60">
                                            {MONTHS[payment.month - 1]} {payment.year}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "font-medium",
                                                payment.currency === 'USD' ? 'text-blue-400' : 'text-emerald-400'
                                            )}>
                                                {formatCurrency(payment.amount, payment.currency)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                                                statusConfig.color
                                            )}>
                                                <StatusIcon className="h-3 w-3" />
                                                {statusConfig.label}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-white/40 tabular-nums">
                                            {payment.expected_payment_date || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-white/40 tabular-nums">
                                            {payment.payment_date || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openEditModal(payment)}
                                                    className="p-2 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                {deleteConfirm === payment.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => handleDelete(payment.id)}
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
                                                        onClick={() => setDeleteConfirm(payment.id)}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    />
                    <div className="relative bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-lg p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-white mb-6">
                            {editingPayment ? 'Editar Pago' : 'Nuevo Pago'}
                        </h2>

                        <div className="space-y-4">
                            {/* Cliente */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Cliente *</label>
                                <select
                                    value={formProjectId}
                                    onChange={(e) => setFormProjectId(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500 transition-colors"
                                >
                                    <option value="" className="bg-[#1a1a1a]">Seleccionar cliente...</option>
                                    {flatProjects.map(p => (
                                        <option key={p.id} value={p.id} className="bg-[#1a1a1a]">{p.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Período */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Mes *</label>
                                    <select
                                        value={formMonth}
                                        onChange={(e) => setFormMonth(parseInt(e.target.value))}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500"
                                    >
                                        {MONTHS.map((month, idx) => (
                                            <option key={idx} value={idx + 1} className="bg-[#1a1a1a]">{month}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Año *</label>
                                    <input
                                        type="number"
                                        value={formYear}
                                        onChange={(e) => setFormYear(parseInt(e.target.value))}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500"
                                    />
                                </div>
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
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500"
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
                                                        ? curr === 'USD' ? "bg-blue-500/20 border-blue-500 text-blue-400" : "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                                                        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                                )}
                                            >
                                                {curr}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Estado */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Estado</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(Object.keys(STATUS_CONFIG) as PaymentStatus[]).map((status) => (
                                        <button
                                            key={status}
                                            type="button"
                                            onClick={() => setFormStatus(status)}
                                            className={cn(
                                                "px-3 py-2 rounded-lg text-xs font-medium border transition-colors",
                                                formStatus === status
                                                    ? STATUS_CONFIG[status].color
                                                    : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                                            )}
                                        >
                                            {STATUS_CONFIG[status].label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Fechas */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Fecha Esperada</label>
                                    <input
                                        type="date"
                                        value={formExpectedDate}
                                        onChange={(e) => setFormExpectedDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Fecha de Pago</label>
                                    <input
                                        type="date"
                                        value={formPaymentDate}
                                        onChange={(e) => setFormPaymentDate(e.target.value)}
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            {/* Método e Invoice */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Método de Pago</label>
                                    <input
                                        type="text"
                                        value={formPaymentMethod}
                                        onChange={(e) => setFormPaymentMethod(e.target.value)}
                                        placeholder="Ej: Transferencia"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-emerald-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-white/80 mb-2">Nº Factura</label>
                                    <input
                                        type="text"
                                        value={formInvoiceNumber}
                                        onChange={(e) => setFormInvoiceNumber(e.target.value)}
                                        placeholder="Ej: FA-00123"
                                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-emerald-500"
                                    />
                                </div>
                            </div>

                            {/* Cuenta destino */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Cuenta destino</label>
                                <select
                                    value={formAccountId}
                                    onChange={(e) => setFormAccountId(e.target.value)}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-emerald-500 transition-colors"
                                >
                                    <option value="" className="bg-[#1a1a1a]">Sin asignar</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id} className="bg-[#1a1a1a]">
                                            {acc.name} ({acc.currency})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Notas */}
                            <div>
                                <label className="block text-sm font-medium text-white/80 mb-2">Notas</label>
                                <textarea
                                    value={formNotes}
                                    onChange={(e) => setFormNotes(e.target.value)}
                                    placeholder="Notas adicionales..."
                                    rows={3}
                                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 outline-none focus:border-emerald-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleSubmit}
                                disabled={!formProjectId || !formAmount || isSubmitting}
                                className="w-full mt-2 px-4 py-3 bg-emerald-500 text-white font-medium rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    editingPayment ? "Guardar Cambios" : "Crear Pago"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Helper to flatten project tree
function flattenProjects(projects: ProjectWithChildren[], result: ProjectWithChildren[] = []): ProjectWithChildren[] {
    for (const p of projects) {
        result.push(p)
        if (p.children?.length) {
            flattenProjects(p.children, result)
        }
    }
    return result
}
