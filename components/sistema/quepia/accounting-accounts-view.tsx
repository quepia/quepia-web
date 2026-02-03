"use client"

import { useState, useEffect } from "react"
import {
    Wallet,
    Plus,
    ArrowRightLeft,
    MoreHorizontal,
    TrendingUp,
    TrendingDown,
    Smartphone,
    Building,
    Banknote,
    Globe,
    Trash2,
    Edit3,
    X,
    AlertCircle,
    ArrowDownRight
} from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { Account, AccountInsert, AccountMovement, AccountTransferInsert } from "@/types/accounting"

interface AccountsViewProps {
    accounts: Account[]
    loading: boolean
    unassignedBalance: number
    onCreateAccount: (account: AccountInsert) => Promise<Account | null>
    onUpdateAccount: (id: string, updates: Partial<AccountInsert>) => Promise<boolean>
    onDeleteAccount: (id: string) => Promise<boolean>
    onCreateTransfer: (transfer: AccountTransferInsert) => Promise<any>
    onFetchMovements: (accountId: string, limit?: number) => Promise<AccountMovement[]>
    onRefresh: () => void
}

const ACCOUNT_ICONS: Record<string, React.ComponentType<any>> = {
    smartphone: Smartphone,
    building: Building,
    banknote: Banknote,
    globe: Globe,
    wallet: Wallet,
}

const ACCOUNT_TYPES = [
    { value: 'digital_wallet', label: 'Billetera Digital', icon: 'smartphone' },
    { value: 'bank', label: 'Banco', icon: 'building' },
    { value: 'cash', label: 'Efectivo', icon: 'banknote' },
    { value: 'international', label: 'Internacional', icon: 'globe' },
] as const

export function AccountingAccountsView({
    accounts,
    loading,
    unassignedBalance,
    onCreateAccount,
    onUpdateAccount,
    onDeleteAccount,
    onCreateTransfer,
    onFetchMovements,
    onRefresh
}: AccountsViewProps) {
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [showTransferModal, setShowTransferModal] = useState(false)
    const [showAssignModal, setShowAssignModal] = useState(false)
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null)
    const [movements, setMovements] = useState<AccountMovement[]>([])
    const [movementsLoading, setMovementsLoading] = useState(false)

    // Cargar movimientos cuando se selecciona una cuenta
    useEffect(() => {
        if (selectedAccount) {
            setMovementsLoading(true)
            onFetchMovements(selectedAccount.id, 10).then((data) => {
                setMovements(data)
                setMovementsLoading(false)
            })
        }
    }, [selectedAccount, onFetchMovements])

    const formatCurrency = (amount: number, currency: string = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount)
    }

    const getMonthChange = (account: Account) => {
        return account.month_income + account.month_transfers_in - account.month_expenses - account.month_transfers_out
    }

    // Calcular totales
    const totalARS = accounts
        .filter(a => a.currency === 'ARS')
        .reduce((sum, a) => sum + (a.current_balance || 0), 0)
    const totalUSD = accounts
        .filter(a => a.currency === 'USD')
        .reduce((sum, a) => sum + (a.current_balance || 0), 0)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-2 border-white/20 border-t-violet-400 rounded-full" />
            </div>
        )
    }

    return (
        <div className="p-4 sm:p-6 space-y-6">
            {/* Header con totales */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-white">Cuentas y Reservas</h2>
                    <p className="text-sm text-white/40">Gestiona dónde está tu dinero</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        onClick={() => setShowTransferModal(true)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] rounded-lg text-sm font-medium transition-colors"
                    >
                        <ArrowRightLeft className="h-4 w-4" />
                        Transferir
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-violet-500 hover:bg-violet-600 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="h-4 w-4" />
                        Nueva Cuenta
                    </button>
                </div>
            </div>

            {/* Cards de totales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Saldo sin distribuir */}
                {unassignedBalance !== 0 && (
                    <div className={cn(
                        "border rounded-xl p-5 relative overflow-hidden",
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
                        </div>
                        <p className={cn(
                            "text-2xl font-bold mb-3",
                            unassignedBalance > 0 ? "text-amber-400" : "text-red-400"
                        )}>
                            {formatCurrency(unassignedBalance, 'ARS')}
                        </p>
                        <button
                            onClick={() => setShowAssignModal(true)}
                            className="flex items-center gap-1.5 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                        >
                            <ArrowDownRight className="h-4 w-4" />
                            Asignar a cuenta
                        </button>
                    </div>
                )}
                <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-white/60 text-sm">Total en ARS</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-400">{formatCurrency(totalARS, 'ARS')}</p>
                </div>
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-white/60 text-sm">Total en USD</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalUSD, 'USD')}</p>
                </div>
            </div>

            {/* Grid de cuentas */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {accounts.map((account) => {
                    const IconComponent = ACCOUNT_ICONS[account.icon] || Wallet
                    const monthChange = getMonthChange(account)
                    const isSelected = selectedAccount?.id === account.id

                    return (
                        <div
                            key={account.id}
                            onClick={() => setSelectedAccount(account)}
                            className={cn(
                                "group bg-white/[0.03] border rounded-xl p-5 cursor-pointer transition-all hover:bg-white/[0.05]",
                                isSelected ? "border-violet-500/50 bg-white/[0.05]" : "border-white/[0.06]"
                            )}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div
                                    className="p-2.5 rounded-lg"
                                    style={{ backgroundColor: `${account.color}20` }}
                                >
                                    <IconComponent
                                        className="h-5 w-5"
                                        style={{ color: account.color }}
                                    />
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="text-xs text-white/40 px-2 py-1 bg-white/[0.05] rounded">
                                        {account.currency}
                                    </span>
                                    {account.is_default && (
                                        <span className="text-xs text-violet-400 px-2 py-1 bg-violet-500/10 rounded">
                                            Default
                                        </span>
                                    )}
                                </div>
                            </div>

                            <h3 className="font-semibold text-white mb-1">{account.name}</h3>
                            <p className="text-2xl font-bold text-white mb-3">
                                {formatCurrency(account.current_balance || 0, account.currency)}
                            </p>

                            <div className={cn(
                                "flex items-center gap-1 text-sm",
                                monthChange >= 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                                {monthChange >= 0 ? (
                                    <TrendingUp className="h-4 w-4" />
                                ) : (
                                    <TrendingDown className="h-4 w-4" />
                                )}
                                <span>
                                    {monthChange >= 0 ? '+' : ''}{formatCurrency(monthChange, account.currency)}
                                </span>
                                <span className="text-white/40">este mes</span>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Panel de movimientos */}
            {selectedAccount && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-white">
                            Últimos movimientos de {selectedAccount.name}
                        </h3>
                        <button
                            onClick={() => setSelectedAccount(null)}
                            className="p-1 hover:bg-white/[0.1] rounded"
                        >
                            <X className="h-4 w-4 text-white/40" />
                        </button>
                    </div>

                    {movementsLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin h-6 w-6 border-2 border-white/20 border-t-violet-400 rounded-full" />
                        </div>
                    ) : movements.length === 0 ? (
                        <div className="text-center text-white/40 py-8">
                            No hay movimientos registrados
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {movements.map((mov, idx) => (
                                <div
                                    key={`${mov.movement_id}-${idx}`}
                                    className="flex items-center justify-between py-3 border-b border-white/[0.06] last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: mov.related_color }}
                                        />
                                        <div>
                                            <p className="text-sm text-white">{mov.description}</p>
                                            <p className="text-xs text-white/40">
                                                {new Date(mov.date).toLocaleDateString('es-AR', {
                                                    day: 'numeric',
                                                    month: 'short'
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={cn(
                                        "font-medium",
                                        mov.is_income ? "text-emerald-400" : "text-red-400"
                                    )}>
                                        {mov.is_income ? '+' : '-'}
                                        {formatCurrency(mov.amount, selectedAccount.currency)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modal crear cuenta */}
            {showCreateModal && (
                <CreateAccountModal
                    onClose={() => setShowCreateModal(false)}
                    onCreate={async (data) => {
                        const result = await onCreateAccount(data)
                        if (result) {
                            setShowCreateModal(false)
                            onRefresh()
                        }
                    }}
                />
            )}

            {/* Modal transferencia */}
            {showTransferModal && (
                <TransferModal
                    accounts={accounts}
                    onClose={() => setShowTransferModal(false)}
                    onTransfer={async (data) => {
                        const result = await onCreateTransfer(data)
                        if (result) {
                            setShowTransferModal(false)
                            onRefresh()
                        }
                    }}
                />
            )}

            {/* Modal asignar saldo */}
            {showAssignModal && (
                <AssignBalanceModal
                    accounts={accounts.filter(a => a.currency === 'ARS')}
                    unassignedBalance={unassignedBalance}
                    onClose={() => setShowAssignModal(false)}
                    onAssign={async (accountId, amount) => {
                        // Buscar la cuenta y actualizar su balance inicial
                        const account = accounts.find(a => a.id === accountId)
                        if (account) {
                            await onUpdateAccount(accountId, {
                                initial_balance: (account.initial_balance || 0) + amount
                            })
                            setShowAssignModal(false)
                            onRefresh()
                        }
                    }}
                />
            )}
        </div>
    )
}

// Modal para crear cuenta
function CreateAccountModal({
    onClose,
    onCreate
}: {
    onClose: () => void
    onCreate: (data: AccountInsert) => Promise<void>
}) {
    const [name, setName] = useState('')
    const [type, setType] = useState<AccountInsert['type']>('bank')
    const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS')
    const [initialBalance, setInitialBalance] = useState('')
    const [color, setColor] = useState('#6366f1')
    const [saving, setSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        await onCreate({
            name,
            type,
            currency,
            initial_balance: parseFloat(initialBalance) || 0,
            color,
            icon: ACCOUNT_TYPES.find(t => t.value === type)?.icon || 'wallet'
        })
        setSaving(false)
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-[#1a1a1a] border-0 sm:border sm:border-white/[0.1] rounded-t-2xl sm:rounded-xl w-full h-[100svh] sm:h-auto sm:max-w-md p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-white">Nueva Cuenta</h2>
                    <button onClick={onClose} className="p-1 hover:bg-white/[0.1] rounded">
                        <X className="h-5 w-5 text-white/40" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Nombre</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
                            placeholder="Ej: Mercado Pago"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">Tipo</label>
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value as AccountInsert['type'])}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-violet-500"
                        >
                            {ACCOUNT_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-white/60 mb-2">Moneda</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value as 'ARS' | 'USD')}
                                className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-violet-500"
                            >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm text-white/60 mb-2">Balance inicial</label>
                            <input
                                type="number"
                                value={initialBalance}
                                onChange={(e) => setInitialBalance(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">Color</label>
                        <div className="flex gap-2">
                            {['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#00bcff'].map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        "w-8 h-8 rounded-full transition-all",
                                        color === c && "ring-2 ring-white ring-offset-2 ring-offset-[#1a1a1a]"
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !name}
                            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg font-medium transition-colors"
                        >
                            {saving ? 'Guardando...' : 'Crear Cuenta'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Modal para transferencia
function TransferModal({
    accounts,
    onClose,
    onTransfer
}: {
    accounts: Account[]
    onClose: () => void
    onTransfer: (data: AccountTransferInsert) => Promise<void>
}) {
    const [fromAccountId, setFromAccountId] = useState('')
    const [toAccountId, setToAccountId] = useState('')
    const [amount, setAmount] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    const fromAccount = accounts.find(a => a.id === fromAccountId)
    const toAccount = accounts.find(a => a.id === toAccountId)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return

        setSaving(true)
        await onTransfer({
            from_account_id: fromAccountId,
            to_account_id: toAccountId,
            amount: parseFloat(amount),
            currency: fromAccount?.currency || 'ARS',
            date: new Date().toISOString().split('T')[0],
            notes: notes || undefined
        })
        setSaving(false)
    }

    const formatCurrency = (amount: number, currency: string = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
        }).format(amount)
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-[#1a1a1a] border-0 sm:border sm:border-white/[0.1] rounded-t-2xl sm:rounded-xl w-full h-[100svh] sm:h-auto sm:max-w-md p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-500/20 rounded-lg">
                            <ArrowRightLeft className="h-5 w-5 text-violet-400" />
                        </div>
                        <h2 className="text-lg font-semibold text-white">Transferir entre cuentas</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/[0.1] rounded">
                        <X className="h-5 w-5 text-white/40" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Desde</label>
                        <select
                            value={fromAccountId}
                            onChange={(e) => setFromAccountId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-violet-500"
                            required
                        >
                            <option value="">Seleccionar cuenta</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name} ({formatCurrency(acc.current_balance, acc.currency)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-center">
                        <div className="p-2 bg-white/[0.05] rounded-full">
                            <ArrowRightLeft className="h-4 w-4 text-white/40 rotate-90" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">Hacia</label>
                        <select
                            value={toAccountId}
                            onChange={(e) => setToAccountId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-violet-500"
                            required
                        >
                            <option value="">Seleccionar cuenta</option>
                            {accounts.filter(a => a.id !== fromAccountId).map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name} ({acc.currency})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">
                            Monto {fromAccount && `(${fromAccount.currency})`}
                        </label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
                            placeholder="0"
                            min="0"
                            step="0.01"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">Notas (opcional)</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-violet-500"
                            placeholder="Ej: Retiro de efectivo"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !fromAccountId || !toAccountId || !amount || fromAccountId === toAccountId}
                            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:opacity-50 rounded-lg font-medium transition-colors"
                        >
                            {saving ? 'Transfiriendo...' : 'Transferir'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// Modal para asignar saldo sin distribuir
function AssignBalanceModal({
    accounts,
    unassignedBalance,
    onClose,
    onAssign
}: {
    accounts: Account[]
    unassignedBalance: number
    onClose: () => void
    onAssign: (accountId: string, amount: number) => Promise<void>
}) {
    const [selectedAccountId, setSelectedAccountId] = useState('')
    const [amount, setAmount] = useState(unassignedBalance.toString())
    const [saving, setSaving] = useState(false)

    const formatCurrency = (amount: number, currency: string = 'ARS') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 0,
        }).format(amount)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedAccountId || !amount) return

        setSaving(true)
        await onAssign(selectedAccountId, parseFloat(amount))
        setSaving(false)
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-[#1a1a1a] border-0 sm:border sm:border-white/[0.1] rounded-t-2xl sm:rounded-xl w-full h-[100svh] sm:h-auto sm:max-w-md p-4 sm:p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-500/20 rounded-lg">
                            <ArrowDownRight className="h-5 w-5 text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Asignar saldo</h2>
                            <p className="text-sm text-white/40">
                                Disponible: {formatCurrency(unassignedBalance)}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/[0.1] rounded">
                        <X className="h-5 w-5 text-white/40" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm text-white/60 mb-2">Cuenta destino</label>
                        <select
                            value={selectedAccountId}
                            onChange={(e) => setSelectedAccountId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white focus:outline-none focus:border-amber-500"
                            required
                        >
                            <option value="">Seleccionar cuenta</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name} ({formatCurrency(acc.current_balance || 0)})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-white/60 mb-2">Monto a asignar</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.1] rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
                            placeholder="0"
                            min="0"
                            max={unassignedBalance}
                            step="0.01"
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setAmount(unassignedBalance.toString())}
                            className="text-xs text-amber-400 hover:text-amber-300 mt-1"
                        >
                            Asignar todo ({formatCurrency(unassignedBalance)})
                        </button>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !selectedAccountId || !amount}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 rounded-lg font-medium transition-colors"
                        >
                            {saving ? 'Asignando...' : 'Asignar saldo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
