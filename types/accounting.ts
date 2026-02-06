// =====================================================
// TIPOS PARA MÓDULO DE CONTABILIDAD
// =====================================================

// Monedas soportadas
export type Currency = 'ARS' | 'USD';

// Estados de pago
export type PaymentStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

// =====================================================
// CATEGORÍAS DE GASTOS
// =====================================================
export interface ExpenseCategory {
    id: string;
    name: string;
    description: string | null;
    color: string;
    is_default: boolean;
    created_at: string;
}

export interface ExpenseCategoryInsert {
    name: string;
    description?: string | null;
    color?: string;
}

export interface ExpenseCategoryUpdate {
    name?: string;
    description?: string | null;
    color?: string;
}

// =====================================================
// PAGOS DE CLIENTES
// =====================================================
export interface ClientPayment {
    id: string;
    project_id: string;
    account_id: string | null;
    month: number;
    year: number;
    amount: number;
    currency: Currency;
    status: PaymentStatus;
    expected_payment_date: string | null;
    payment_date: string | null;
    payment_method: string | null;
    invoice_number: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}

// Con datos del proyecto y cuenta (del RPC)
export interface ClientPaymentWithProject extends ClientPayment {
    project_name: string;
    project_color: string;
    account_name: string | null;
    account_color: string | null;
}

export interface ClientPaymentInsert {
    project_id: string;
    account_id?: string | null;
    month: number;
    year: number;
    amount: number;
    currency?: Currency;
    status?: PaymentStatus;
    expected_payment_date?: string | null;
    payment_date?: string | null;
    payment_method?: string | null;
    invoice_number?: string | null;
    notes?: string | null;
}

export interface ClientPaymentUpdate {
    project_id?: string;
    account_id?: string | null;
    month?: number;
    year?: number;
    amount?: number;
    currency?: Currency;
    status?: PaymentStatus;
    expected_payment_date?: string | null;
    payment_date?: string | null;
    payment_method?: string | null;
    invoice_number?: string | null;
    notes?: string | null;
}

// =====================================================
// GASTOS
// =====================================================
export interface Expense {
    id: string;
    date: string;
    category_id: string | null;
    subcategory_id: string | null;
    account_id: string | null;
    description: string;
    amount: number;
    currency: Currency;
    provider: string | null;
    receipt_url: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}

// Con datos de categoría, subcategoría y cuenta (del RPC)
export interface ExpenseWithCategory extends Expense {
    category_name: string | null;
    category_color: string | null;
    subcategory_name: string | null;
    account_name: string | null;
    account_color: string | null;
}

export interface ExpenseInsert {
    date: string;
    category_id?: string | null;
    subcategory_id?: string | null;
    account_id?: string | null;
    description: string;
    amount: number;
    currency?: Currency;
    provider?: string | null;
    receipt_url?: string | null;
    notes?: string | null;
}

export interface ExpenseUpdate {
    date?: string;
    category_id?: string | null;
    subcategory_id?: string | null;
    account_id?: string | null;
    description?: string;
    amount?: number;
    currency?: Currency;
    provider?: string | null;
    receipt_url?: string | null;
    notes?: string | null;
}

// =====================================================
// RESUMEN / DASHBOARD
// =====================================================
export interface AccountingSummary {
    total_income_ars: number;
    total_income_usd: number;
    total_expenses_ars: number;
    total_expenses_usd: number;
    pending_payments: number;
    overdue_payments: number;
}

// =====================================================
// FILTROS
// =====================================================
export interface PaymentFilters {
    year?: number;
    month?: number;
    project_id?: string;
    status?: PaymentStatus;
    account_id?: string;
}

export interface ExpenseFilters {
    start_date?: string;
    end_date?: string;
    category_id?: string;
    account_id?: string;
}

// =====================================================
// CUENTAS / RESERVAS
// =====================================================
export type AccountType = 'digital_wallet' | 'bank' | 'cash' | 'international';

export interface Account {
    id: string;
    name: string;
    type: AccountType;
    currency: Currency;
    initial_balance: number;
    current_balance: number;
    icon: string;
    color: string;
    is_default: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    // Datos del mes actual
    month_income: number;
    month_expenses: number;
    month_transfers_in: number;
    month_transfers_out: number;
    // Datos del año actual (para saldo sin distribuir)
    year_transfers_in: number;
    year_transfers_out: number;
    year_adjustments: number;
}

export interface AccountInsert {
    name: string;
    type?: AccountType;
    currency?: Currency;
    initial_balance?: number;
    icon?: string;
    color?: string;
    is_default?: boolean;
}

export interface AccountUpdate {
    name?: string;
    type?: AccountType;
    currency?: Currency;
    initial_balance?: number;
    icon?: string;
    color?: string;
    is_default?: boolean;
    is_active?: boolean;
}

// =====================================================
// TRANSFERENCIAS ENTRE CUENTAS
// =====================================================
export interface AccountTransfer {
    id: string;
    from_account_id: string;
    from_account_name: string;
    from_account_color: string;
    to_account_id: string;
    to_account_name: string;
    to_account_color: string;
    amount: number;
    currency: Currency;
    exchange_rate: number | null;
    date: string;
    notes: string | null;
    created_at: string;
}

export interface AccountTransferInsert {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    currency?: Currency;
    exchange_rate?: number;
    commission?: number;
    tax?: number;
    date: string;
    notes?: string;
}

// =====================================================
// AJUSTES DE BALANCE (ARQUEO DE CAJA)
// =====================================================
export interface BalanceAdjustment {
    id: string;
    account_id: string;
    date: string;
    previous_balance: number;
    new_balance: number;
    adjustment_amount: number;
    reason?: string;
    created_at: string;
}

export interface BalanceAdjustmentInsert {
    account_id: string;
    date?: string;
    previous_balance: number;
    new_balance: number;
    adjustment_amount: number;
    reason?: string;
}

// =====================================================
// SUBCATEGORÍAS DE GASTOS
// =====================================================
export interface ExpenseSubcategory {
    id: string;
    category_id: string;
    category_name: string | null;
    name: string;
    created_at: string;
}

export interface ExpenseSubcategoryInsert {
    category_id: string;
    name: string;
}

// =====================================================
// MOVIMIENTOS DE CUENTA
// =====================================================
export interface AccountMovement {
    movement_type: 'payment' | 'expense' | 'transfer_in' | 'transfer_out';
    movement_id: string;
    date: string;
    description: string;
    amount: number;
    is_income: boolean;
    related_entity: string;
    related_color: string;
    is_future?: boolean;
}

// =====================================================
// DATOS PARA GRÁFICOS
// =====================================================
export interface MonthlyChartData {
    month: number;
    month_name: string;
    total_income: number;
    total_expenses: number;
    balance: number;
}

export interface ExpenseDistribution {
    category_id: string;
    category_name: string;
    category_color: string;
    total_amount: number;
    percentage: number;
    expense_count: number;
}

// =====================================================
// FUTURAS INVERSIONES
// =====================================================
export type InvestmentPriority = 'low' | 'medium' | 'high';
export type InvestmentCategory = 'equipment' | 'subscription' | 'accessory' | 'software' | 'other';

export interface FutureInvestment {
    id: string;
    name: string;
    url: string | null;
    estimated_price: number | null;
    currency: Currency;
    priority: InvestmentPriority;
    category: InvestmentCategory;
    notes: string | null;
    is_purchased: boolean;
    purchased_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface FutureInvestmentInsert {
    name: string;
    url?: string | null;
    estimated_price?: number | null;
    currency?: Currency;
    priority?: InvestmentPriority;
    category?: InvestmentCategory;
    notes?: string | null;
}

export interface FutureInvestmentUpdate {
    name?: string;
    url?: string | null;
    estimated_price?: number | null;
    currency?: Currency;
    priority?: InvestmentPriority;
    category?: InvestmentCategory;
    notes?: string | null;
    is_purchased?: boolean;
    purchased_at?: string | null;
}

// =====================================================
// HISTORIAL UNIFICADO
// =====================================================
export type UnifiedMovementType = 'payment' | 'expense' | 'transfer_in' | 'transfer_out' | 'adjustment';

export interface UnifiedMovement {
    id: string;
    movement_type: UnifiedMovementType;
    date: string;
    description: string;
    amount: number;
    currency: Currency;
    is_income: boolean;
    account_id: string | null;
    account_name: string | null;
    account_color: string | null;
    related_entity: string;
    related_color: string;
    category: string;
    notes: string | null;
    created_at: string;
}

export interface HistoryFilters {
    start_date?: string;
    end_date?: string;
    account_id?: string;
    movement_type?: UnifiedMovementType | 'transfer';
    limit?: number;
    offset?: number;
}

export interface HistorySummary {
    total_income_ars: number;
    total_income_usd: number;
    total_expenses_ars: number;
    total_expenses_usd: number;
    total_transfers: number;
    total_adjustments: number;
    movement_count: number;
}
