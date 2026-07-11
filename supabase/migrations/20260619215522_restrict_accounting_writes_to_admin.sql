-- Accounting is only rendered for sistema admin users. Mirror that rule in
-- PostgreSQL so a regular authenticated session cannot modify financial data
-- by calling the Data API directly. Read access stays unchanged for now.

DROP POLICY IF EXISTS "Allow authenticated write accounts" ON public.accounting_accounts;
DROP POLICY IF EXISTS "Allow authenticated write categories" ON public.accounting_expense_categories;
DROP POLICY IF EXISTS "Allow authenticated write payments" ON public.accounting_client_payments;
DROP POLICY IF EXISTS "Allow authenticated write expenses" ON public.accounting_expenses;
DROP POLICY IF EXISTS "Allow authenticated write subcategories" ON public.accounting_expense_subcategories;
DROP POLICY IF EXISTS "Allow authenticated write transfers" ON public.accounting_transfers;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.accounting_future_investments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.accounting_balance_adjustments;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.accounting_partner_contributions;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.accounting_contribution_repayments;

DROP POLICY IF EXISTS accounting_counterparties_admin_manage ON public.accounting_counterparties;

DROP POLICY IF EXISTS accounting_future_investments_authenticated_read ON public.accounting_future_investments;
CREATE POLICY accounting_future_investments_authenticated_read
  ON public.accounting_future_investments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accounting_balance_adjustments_authenticated_read ON public.accounting_balance_adjustments;
CREATE POLICY accounting_balance_adjustments_authenticated_read
  ON public.accounting_balance_adjustments
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accounting_partner_contributions_authenticated_read ON public.accounting_partner_contributions;
CREATE POLICY accounting_partner_contributions_authenticated_read
  ON public.accounting_partner_contributions
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accounting_contribution_repayments_authenticated_read ON public.accounting_contribution_repayments;
CREATE POLICY accounting_contribution_repayments_authenticated_read
  ON public.accounting_contribution_repayments
  FOR SELECT TO authenticated
  USING (true);

DO $policies$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'accounting_accounts',
    'accounting_expense_categories',
    'accounting_client_payments',
    'accounting_expenses',
    'accounting_expense_subcategories',
    'accounting_transfers',
    'accounting_future_investments',
    'accounting_balance_adjustments',
    'accounting_partner_contributions',
    'accounting_contribution_repayments',
    'accounting_counterparties'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS accounting_admin_insert ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY accounting_admin_insert ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT public.sistema_is_admin((SELECT auth.uid()))))',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS accounting_admin_update ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY accounting_admin_update ON public.%I FOR UPDATE TO authenticated USING ((SELECT public.sistema_is_admin((SELECT auth.uid())))) WITH CHECK ((SELECT public.sistema_is_admin((SELECT auth.uid()))))',
      table_name
    );

    EXECUTE format('DROP POLICY IF EXISTS accounting_admin_delete ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY accounting_admin_delete ON public.%I FOR DELETE TO authenticated USING ((SELECT public.sistema_is_admin((SELECT auth.uid()))))',
      table_name
    );
  END LOOP;
END
$policies$;

-- Cover the foreign keys used by balance and history queries.
CREATE INDEX IF NOT EXISTS accounting_balance_adjustments_account_idx
  ON public.accounting_balance_adjustments(account_id);
CREATE INDEX IF NOT EXISTS accounting_partner_contributions_account_idx
  ON public.accounting_partner_contributions(account_id);
CREATE INDEX IF NOT EXISTS accounting_contribution_repayments_contribution_idx
  ON public.accounting_contribution_repayments(contribution_id);
CREATE INDEX IF NOT EXISTS accounting_contribution_repayments_account_idx
  ON public.accounting_contribution_repayments(account_id);
CREATE INDEX IF NOT EXISTS sistema_proposals_accounting_payment_idx
  ON public.sistema_proposals(accounting_payment_id)
  WHERE accounting_payment_id IS NOT NULL;
