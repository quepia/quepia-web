'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type {
    ExpenseCategory,
    ExpenseCategoryInsert,
    ExpenseCategoryUpdate,
    ClientPayment,
    ClientPaymentInsert,
    ClientPaymentUpdate,
    ClientPaymentWithProject,
    Expense,
    ExpenseInsert,
    ExpenseUpdate,
    ExpenseWithCategory,
    AccountingSummary,
    PaymentFilters,
    ExpenseFilters,
    // Nuevos tipos
    Account,
    AccountInsert,
    AccountUpdate,
    AccountTransfer,
    AccountTransferInsert,
    ExpenseSubcategory,
    ExpenseSubcategoryInsert,
    AccountMovement,
    MonthlyChartData,
    ExpenseDistribution,
    BalanceAdjustmentInsert,
    // Futuras inversiones
    FutureInvestment,
    FutureInvestmentInsert,
    FutureInvestmentUpdate,
    // Historial unificado
    UnifiedMovement,
    HistoryFilters,
    HistorySummary,
    // Aportes de socios
    PartnerContribution,
    PartnerContributionInsert,
    PartnerContributionUpdate,
    ContributionRepayment,
    ContributionRepaymentInsert,
    ContributionsSummary,
    ContributionsTotals,
    ContributionStatus,
} from '@/types/accounting';

// =====================================================
// HOOK: useAccounting
// =====================================================
export function useAccounting() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // =====================================================
    // CATEGORÍAS DE GASTOS
    // =====================================================
    const [categories, setCategories] = useState<ExpenseCategory[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);

    const fetchCategories = useCallback(async () => {
        try {
            setCategoriesLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase
                .from('accounting_expense_categories')
                .select('*')
                .order('name');

            if (fetchError) throw fetchError;
            setCategories(data || []);
        } catch (err) {
            console.error('Error fetching categories:', err);
            setError(err instanceof Error ? err.message : 'Error fetching categories');
        } finally {
            setCategoriesLoading(false);
        }
    }, []);

    const createCategory = async (category: ExpenseCategoryInsert): Promise<ExpenseCategory | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_expense_categories')
                .insert(category)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchCategories();
            return data;
        } catch (err) {
            console.error('Error creating category:', err);
            setError(err instanceof Error ? err.message : 'Error creating category');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateCategory = async (id: string, updates: ExpenseCategoryUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_expense_categories')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchCategories();
            return true;
        } catch (err) {
            console.error('Error updating category:', err);
            setError(err instanceof Error ? err.message : 'Error updating category');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteCategory = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_expense_categories')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchCategories();
            return true;
        } catch (err) {
            console.error('Error deleting category:', err);
            setError(err instanceof Error ? err.message : 'Error deleting category');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // PAGOS DE CLIENTES
    // =====================================================
    const [payments, setPayments] = useState<ClientPaymentWithProject[]>([]);
    const [paymentsLoading, setPaymentsLoading] = useState(true);

    const fetchPayments = useCallback(async (filters?: PaymentFilters) => {
        try {
            setPaymentsLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_payments', {
                p_year: filters?.year || null,
                p_month: filters?.month || null,
                p_project_id: filters?.project_id || null,
                p_status: filters?.status || null,
            });

            if (fetchError) {
                console.error('Supabase RPC error details:', {
                    message: fetchError.message,
                    code: fetchError.code,
                    details: fetchError.details,
                    hint: fetchError.hint,
                });
                throw fetchError;
            }
            setPayments(data || []);
        } catch (err: any) {
            console.error('Error fetching payments:', err?.message || err?.code || JSON.stringify(err));
            setError(err instanceof Error ? err.message : 'Error fetching payments');
        } finally {
            setPaymentsLoading(false);
        }
    }, []);

    const createPayment = async (payment: ClientPaymentInsert): Promise<ClientPayment | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_client_payments')
                .insert(payment)
                .select()
                .single();

            if (insertError) {
                console.error('Supabase insert error details:', {
                    message: insertError.message,
                    code: insertError.code,
                    details: insertError.details,
                    hint: insertError.hint,
                });
                throw insertError;
            }
            await fetchPayments();
            return data;
        } catch (err: any) {
            console.error('Error creating payment:', err?.message || err?.code || JSON.stringify(err));
            setError(err instanceof Error ? err.message : 'Error creating payment');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updatePayment = async (id: string, updates: ClientPaymentUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_client_payments')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchPayments();
            return true;
        } catch (err) {
            console.error('Error updating payment:', err);
            setError(err instanceof Error ? err.message : 'Error updating payment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deletePayment = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_client_payments')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchPayments();
            return true;
        } catch (err) {
            console.error('Error deleting payment:', err);
            setError(err instanceof Error ? err.message : 'Error deleting payment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // GASTOS
    // =====================================================
    const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
    const [expensesLoading, setExpensesLoading] = useState(true);

    const fetchExpenses = useCallback(async (filters?: ExpenseFilters) => {
        try {
            setExpensesLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_expenses', {
                p_start_date: filters?.start_date || null,
                p_end_date: filters?.end_date || null,
                p_category_id: filters?.category_id || null,
            });

            if (fetchError) throw fetchError;
            setExpenses(data || []);
        } catch (err) {
            console.error('Error fetching expenses:', err);
            setError(err instanceof Error ? err.message : 'Error fetching expenses');
        } finally {
            setExpensesLoading(false);
        }
    }, []);

    const createExpense = async (expense: ExpenseInsert): Promise<Expense | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_expenses')
                .insert(expense)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchExpenses();
            return data;
        } catch (err) {
            console.error('Error creating expense:', err);
            setError(err instanceof Error ? err.message : 'Error creating expense');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateExpense = async (id: string, updates: ExpenseUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_expenses')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchExpenses();
            return true;
        } catch (err) {
            console.error('Error updating expense:', err);
            setError(err instanceof Error ? err.message : 'Error updating expense');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteExpense = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_expenses')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchExpenses();
            return true;
        } catch (err) {
            console.error('Error deleting expense:', err);
            setError(err instanceof Error ? err.message : 'Error deleting expense');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // UPLOAD DE COMPROBANTES
    // =====================================================
    const uploadReceipt = async (file: File, expenseId: string): Promise<string | null> => {
        try {
            setLoading(true);
            const supabase = createClient();

            const fileExt = file.name.split('.').pop();
            const fileName = `${expenseId}-${Date.now()}.${fileExt}`;
            const filePath = `receipts/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('accounting')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('accounting')
                .getPublicUrl(filePath);

            // Actualizar el gasto con la URL del comprobante
            await updateExpense(expenseId, { receipt_url: urlData.publicUrl });

            return urlData.publicUrl;
        } catch (err) {
            console.error('Error uploading receipt:', err);
            setError(err instanceof Error ? err.message : 'Error uploading receipt');
            return null;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // RESUMEN
    // =====================================================
    const [summary, setSummary] = useState<AccountingSummary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);

    const fetchSummary = useCallback(async (year?: number) => {
        try {
            setSummaryLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_summary', {
                p_year: year || new Date().getFullYear(),
            });

            if (fetchError) throw fetchError;
            setSummary(data);
        } catch (err) {
            console.error('Error fetching summary:', err);
            setError(err instanceof Error ? err.message : 'Error fetching summary');
        } finally {
            setSummaryLoading(false);
        }
    }, []);

    // =====================================================
    // CUENTAS / RESERVAS
    // =====================================================
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);

    const fetchAccounts = useCallback(async () => {
        try {
            setAccountsLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_accounts');

            if (fetchError) throw fetchError;
            setAccounts(data || []);
        } catch (err) {
            console.error('Error fetching accounts:', err);
            setError(err instanceof Error ? err.message : 'Error fetching accounts');
        } finally {
            setAccountsLoading(false);
        }
    }, []);

    const createAccount = async (account: AccountInsert): Promise<Account | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_accounts')
                .insert(account)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchAccounts();
            return data;
        } catch (err) {
            console.error('Error creating account:', err);
            setError(err instanceof Error ? err.message : 'Error creating account');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateAccount = async (id: string, updates: AccountUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_accounts')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchAccounts();
            return true;
        } catch (err) {
            console.error('Error updating account:', err);
            setError(err instanceof Error ? err.message : 'Error updating account');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteAccount = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            // Soft delete - marcar como inactivo
            const { error: updateError } = await supabase
                .from('accounting_accounts')
                .update({ is_active: false })
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchAccounts();
            return true;
        } catch (err) {
            console.error('Error deleting account:', err);
            setError(err instanceof Error ? err.message : 'Error deleting account');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // TRANSFERENCIAS ENTRE CUENTAS
    // =====================================================
    const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
    const [transfersLoading, setTransfersLoading] = useState(true);

    const fetchTransfers = useCallback(async (startDate?: string, endDate?: string, accountId?: string) => {
        try {
            setTransfersLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_transfers', {
                p_start_date: startDate || null,
                p_end_date: endDate || null,
                p_account_id: accountId || null,
            });

            if (fetchError) throw fetchError;
            setTransfers(data || []);
        } catch (err) {
            console.error('Error fetching transfers:', err);
            setError(err instanceof Error ? err.message : 'Error fetching transfers');
        } finally {
            setTransfersLoading(false);
        }
    }, []);

    const createTransfer = async (transfer: AccountTransferInsert): Promise<AccountTransfer | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_transfers')
                .insert(transfer)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchTransfers();
            await fetchAccounts(); // Actualizar balances
            return data;
        } catch (err) {
            console.error('Error creating transfer:', err);
            setError(err instanceof Error ? err.message : 'Error creating transfer');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const deleteTransfer = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_transfers')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchTransfers();
            await fetchAccounts(); // Actualizar balances
            return true;
        } catch (err) {
            console.error('Error deleting transfer:', err);
            setError(err instanceof Error ? err.message : 'Error deleting transfer');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // AJUSTES DE BALANCE (ARQUEO DE CAJA)
    // =====================================================
    const createBalanceAdjustment = async (adjustment: BalanceAdjustmentInsert): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: insertError } = await supabase
                .from('accounting_balance_adjustments')
                .insert(adjustment);

            if (insertError) throw insertError;
            await fetchAccounts(); // Actualizar balances
            return true;
        } catch (err) {
            console.error('Error creating balance adjustment:', err);
            setError(err instanceof Error ? err.message : 'Error creating balance adjustment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // SUBCATEGORÍAS
    // =====================================================
    const [subcategories, setSubcategories] = useState<ExpenseSubcategory[]>([]);
    const [subcategoriesLoading, setSubcategoriesLoading] = useState(true);

    const fetchSubcategories = useCallback(async (categoryId?: string) => {
        try {
            setSubcategoriesLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_expense_subcategories', {
                p_category_id: categoryId || null,
            });

            if (fetchError) throw fetchError;
            setSubcategories(data || []);
        } catch (err) {
            console.error('Error fetching subcategories:', err);
            setError(err instanceof Error ? err.message : 'Error fetching subcategories');
        } finally {
            setSubcategoriesLoading(false);
        }
    }, []);

    const createSubcategory = async (subcategory: ExpenseSubcategoryInsert): Promise<ExpenseSubcategory | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_expense_subcategories')
                .insert(subcategory)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchSubcategories();
            return data;
        } catch (err) {
            console.error('Error creating subcategory:', err);
            setError(err instanceof Error ? err.message : 'Error creating subcategory');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const deleteSubcategory = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_expense_subcategories')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchSubcategories();
            return true;
        } catch (err) {
            console.error('Error deleting subcategory:', err);
            setError(err instanceof Error ? err.message : 'Error deleting subcategory');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // =====================================================
    // MOVIMIENTOS DE CUENTA
    // =====================================================
    const fetchAccountMovements = async (accountId: string, limit: number = 20): Promise<AccountMovement[]> => {
        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_account_movements', {
                p_account_id: accountId,
                p_limit: limit,
            });

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error('Error fetching account movements:', err);
            setError(err instanceof Error ? err.message : 'Error fetching movements');
            return [];
        }
    };

    // =====================================================
    // DATOS PARA GRÁFICOS
    // =====================================================
    const [monthlyChartData, setMonthlyChartData] = useState<MonthlyChartData[]>([]);
    const [chartLoading, setChartLoading] = useState(false);

    const fetchMonthlyChartData = useCallback(async (year?: number) => {
        try {
            setChartLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_accounting_monthly_chart', {
                p_year: year || new Date().getFullYear(),
            });

            if (fetchError) throw fetchError;
            setMonthlyChartData(data || []);
        } catch (err) {
            console.error('Error fetching chart data:', err);
            setError(err instanceof Error ? err.message : 'Error fetching chart data');
        } finally {
            setChartLoading(false);
        }
    }, []);

    const [expenseDistribution, setExpenseDistribution] = useState<ExpenseDistribution[]>([]);

    const fetchExpenseDistribution = useCallback(async (year?: number, month?: number) => {
        try {
            setChartLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_expense_distribution', {
                p_year: year || new Date().getFullYear(),
                p_month: month || null,
            });

            if (fetchError) throw fetchError;
            setExpenseDistribution(data || []);
        } catch (err) {
            console.error('Error fetching expense distribution:', err);
            setError(err instanceof Error ? err.message : 'Error fetching distribution');
        } finally {
            setChartLoading(false);
        }
    }, []);

    // =====================================================
    // FUTURAS INVERSIONES
    // =====================================================
    const [investments, setInvestments] = useState<FutureInvestment[]>([]);
    const [investmentsLoading, setInvestmentsLoading] = useState(true);

    const fetchInvestments = useCallback(async (includePurchased: boolean = false) => {
        try {
            setInvestmentsLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_future_investments', {
                p_include_purchased: includePurchased,
                p_category: null,
                p_priority: null,
            });

            if (fetchError) throw fetchError;
            setInvestments(data || []);
        } catch (err) {
            console.error('Error fetching investments:', err);
            setError(err instanceof Error ? err.message : 'Error fetching investments');
        } finally {
            setInvestmentsLoading(false);
        }
    }, []);

    const createInvestment = async (investment: FutureInvestmentInsert): Promise<FutureInvestment | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_future_investments')
                .insert(investment)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchInvestments();
            return data;
        } catch (err) {
            console.error('Error creating investment:', err);
            setError(err instanceof Error ? err.message : 'Error creating investment');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateInvestment = async (id: string, updates: FutureInvestmentUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_future_investments')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchInvestments();
            return true;
        } catch (err) {
            console.error('Error updating investment:', err);
            setError(err instanceof Error ? err.message : 'Error updating investment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteInvestment = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_future_investments')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchInvestments();
            return true;
        } catch (err) {
            console.error('Error deleting investment:', err);
            setError(err instanceof Error ? err.message : 'Error deleting investment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const markInvestmentAsPurchased = async (id: string): Promise<boolean> => {
        return updateInvestment(id, {
            is_purchased: true,
            purchased_at: new Date().toISOString(),
        });
    };

    // =====================================================
    // HISTORIAL UNIFICADO
    // =====================================================
    const [history, setHistory] = useState<UnifiedMovement[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null);

    const fetchHistory = useCallback(async (filters?: HistoryFilters) => {
        try {
            setHistoryLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_unified_history', {
                p_start_date: filters?.start_date || null,
                p_end_date: filters?.end_date || null,
                p_account_id: filters?.account_id || null,
                p_movement_type: filters?.movement_type || null,
                p_limit: filters?.limit || 100,
                p_offset: filters?.offset || 0,
            });

            if (fetchError) throw fetchError;
            setHistory(data || []);
        } catch (err) {
            console.error('Error fetching history:', err);
            setError(err instanceof Error ? err.message : 'Error fetching history');
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    const fetchHistorySummary = useCallback(async (filters?: Omit<HistoryFilters, 'limit' | 'offset' | 'movement_type'>) => {
        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_history_summary', {
                p_start_date: filters?.start_date || null,
                p_end_date: filters?.end_date || null,
                p_account_id: filters?.account_id || null,
            });

            if (fetchError) throw fetchError;
            setHistorySummary(data);
        } catch (err) {
            console.error('Error fetching history summary:', err);
            setError(err instanceof Error ? err.message : 'Error fetching history summary');
        }
    }, []);

    // =====================================================
    // APORTES DE SOCIOS
    // =====================================================
    const [contributions, setContributions] = useState<PartnerContribution[]>([]);
    const [contributionsLoading, setContributionsLoading] = useState(true);
    const [contributionsTotals, setContributionsTotals] = useState<ContributionsTotals | null>(null);
    const [contributionsSummary, setContributionsSummary] = useState<ContributionsSummary[]>([]);

    const fetchContributions = useCallback(async (status?: ContributionStatus, partnerName?: string) => {
        try {
            setContributionsLoading(true);
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_partner_contributions', {
                p_status: status || null,
                p_partner_name: partnerName || null,
            });

            if (fetchError) throw fetchError;
            setContributions(data || []);
        } catch (err) {
            console.error('Error fetching contributions:', err);
            setError(err instanceof Error ? err.message : 'Error fetching contributions');
        } finally {
            setContributionsLoading(false);
        }
    }, []);

    const fetchContributionsTotals = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_contributions_totals');

            if (fetchError) throw fetchError;
            setContributionsTotals(data);
        } catch (err) {
            console.error('Error fetching contributions totals:', err);
            setError(err instanceof Error ? err.message : 'Error fetching contributions totals');
        }
    }, []);

    const fetchContributionsSummary = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_contributions_summary');

            if (fetchError) throw fetchError;
            setContributionsSummary(data || []);
        } catch (err) {
            console.error('Error fetching contributions summary:', err);
            setError(err instanceof Error ? err.message : 'Error fetching contributions summary');
        }
    }, []);

    const createContribution = async (contribution: PartnerContributionInsert): Promise<PartnerContribution | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_partner_contributions')
                .insert(contribution)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchContributions();
            await fetchContributionsTotals();
            await fetchAccounts(); // Actualizar balances de cuenta
            return data;
        } catch (err) {
            console.error('Error creating contribution:', err);
            setError(err instanceof Error ? err.message : 'Error creating contribution');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const updateContribution = async (id: string, updates: PartnerContributionUpdate): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: updateError } = await supabase
                .from('accounting_partner_contributions')
                .update(updates)
                .eq('id', id);

            if (updateError) throw updateError;
            await fetchContributions();
            await fetchContributionsTotals();
            return true;
        } catch (err) {
            console.error('Error updating contribution:', err);
            setError(err instanceof Error ? err.message : 'Error updating contribution');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const deleteContribution = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_partner_contributions')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchContributions();
            await fetchContributionsTotals();
            await fetchAccounts();
            return true;
        } catch (err) {
            console.error('Error deleting contribution:', err);
            setError(err instanceof Error ? err.message : 'Error deleting contribution');
            return false;
        } finally {
            setLoading(false);
        }
    };

    const fetchContributionRepayments = async (contributionId: string): Promise<ContributionRepayment[]> => {
        try {
            const supabase = createClient();
            const { data, error: fetchError } = await supabase.rpc('get_contribution_repayments', {
                p_contribution_id: contributionId,
            });

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error('Error fetching repayments:', err);
            setError(err instanceof Error ? err.message : 'Error fetching repayments');
            return [];
        }
    };

    const createRepayment = async (repayment: ContributionRepaymentInsert): Promise<ContributionRepayment | null> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { data, error: insertError } = await supabase
                .from('accounting_contribution_repayments')
                .insert(repayment)
                .select()
                .single();

            if (insertError) throw insertError;
            await fetchContributions();
            await fetchContributionsTotals();
            await fetchAccounts(); // Actualizar balances
            return data;
        } catch (err) {
            console.error('Error creating repayment:', err);
            setError(err instanceof Error ? err.message : 'Error creating repayment');
            return null;
        } finally {
            setLoading(false);
        }
    };

    const deleteRepayment = async (id: string): Promise<boolean> => {
        try {
            setLoading(true);
            const supabase = createClient();
            const { error: deleteError } = await supabase
                .from('accounting_contribution_repayments')
                .delete()
                .eq('id', id);

            if (deleteError) throw deleteError;
            await fetchContributions();
            await fetchContributionsTotals();
            await fetchAccounts();
            return true;
        } catch (err) {
            console.error('Error deleting repayment:', err);
            setError(err instanceof Error ? err.message : 'Error deleting repayment');
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Cargar datos iniciales
    useEffect(() => {
        fetchCategories();
        fetchPayments();
        fetchExpenses();
        fetchSummary();
        fetchAccounts();
        fetchTransfers();
        fetchSubcategories();
        fetchMonthlyChartData();
        fetchExpenseDistribution();
        fetchInvestments();
        fetchContributions();
        fetchContributionsTotals();
    }, [fetchCategories, fetchPayments, fetchExpenses, fetchSummary, fetchAccounts, fetchTransfers, fetchSubcategories, fetchMonthlyChartData, fetchExpenseDistribution, fetchInvestments, fetchContributions, fetchContributionsTotals]);

    return {
        // Estado general
        loading,
        error,
        clearError: () => setError(null),

        // Categorías
        categories,
        categoriesLoading,
        fetchCategories,
        createCategory,
        updateCategory,
        deleteCategory,

        // Pagos
        payments,
        paymentsLoading,
        fetchPayments,
        createPayment,
        updatePayment,
        deletePayment,

        // Gastos
        expenses,
        expensesLoading,
        fetchExpenses,
        createExpense,
        updateExpense,
        deleteExpense,
        uploadReceipt,

        // Resumen
        summary,
        summaryLoading,
        fetchSummary,

        // Cuentas
        accounts,
        accountsLoading,
        fetchAccounts,
        createAccount,
        updateAccount,
        deleteAccount,

        // Transferencias
        transfers,
        transfersLoading,
        fetchTransfers,
        createTransfer,
        deleteTransfer,

        // Ajustes de balance (arqueo de caja)
        createBalanceAdjustment,

        // Subcategorías
        subcategories,
        subcategoriesLoading,
        fetchSubcategories,
        createSubcategory,
        deleteSubcategory,

        // Movimientos
        fetchAccountMovements,

        // Gráficos
        monthlyChartData,
        expenseDistribution,
        chartLoading,
        fetchMonthlyChartData,
        fetchExpenseDistribution,

        // Futuras inversiones
        investments,
        investmentsLoading,
        fetchInvestments,
        createInvestment,
        updateInvestment,
        deleteInvestment,
        markInvestmentAsPurchased,

        // Historial unificado
        history,
        historyLoading,
        historySummary,
        fetchHistory,
        fetchHistorySummary,

        // Aportes de socios
        contributions,
        contributionsLoading,
        contributionsTotals,
        contributionsSummary,
        fetchContributions,
        fetchContributionsTotals,
        fetchContributionsSummary,
        createContribution,
        updateContribution,
        deleteContribution,
        fetchContributionRepayments,
        createRepayment,
        deleteRepayment,
    };
}
