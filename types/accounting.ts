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
    date: string;
    notes?: string;
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
