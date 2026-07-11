-- Accounting safety hotfix.
-- This migration is intentionally additive: no accounting row is deleted or
-- overwritten. Legacy transfer fields remain available for traceability.

-- The current unified-history RPC selects adj.notes, while the table only had
-- reason. Adding and backfilling the column repairs the RPC without rewriting
-- any adjustment or changing its balance impact.
ALTER TABLE public.accounting_balance_adjustments
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.accounting_balance_adjustments
SET notes = reason
WHERE notes IS NULL
  AND reason IS NOT NULL;

COMMENT ON COLUMN public.accounting_balance_adjustments.notes IS
  'Detalle histórico del ajuste. Inicialmente preserva el valor de reason.';

-- Preserve both sides of a conversion. `amount`, `currency`, `commission`,
-- `tax` and `exchange_rate` remain untouched as the legacy source of truth.
ALTER TABLE public.accounting_transfers
  ADD COLUMN IF NOT EXISTS source_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS source_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS destination_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS destination_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(18, 2),
  ADD COLUMN IF NOT EXISTS fee_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS is_legacy_derived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.accounting_transfers
  ALTER COLUMN exchange_rate TYPE NUMERIC(18, 8)
  USING exchange_rate::NUMERIC(18, 8);

-- Round every received amount at currency precision. This removes microscopic
-- residues such as -3e-16 while retaining NUMERIC arithmetic in PostgreSQL.
CREATE OR REPLACE FUNCTION public.accounting_transfer_received_amount(
  p_amount DECIMAL,
  p_exchange_rate DECIMAL,
  p_commission DECIMAL,
  p_tax DECIMAL,
  p_target_currency VARCHAR
)
RETURNS DECIMAL
LANGUAGE SQL
IMMUTABLE
SET search_path = ''
AS $accounting_transfer_received_amount$
  SELECT ROUND(
    CASE
      WHEN p_exchange_rate IS NOT NULL AND p_exchange_rate > 0 THEN
        CASE
          WHEN p_target_currency = 'USD' THEN
            GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0)) / p_exchange_rate
          ELSE
            GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0)) * p_exchange_rate
        END
      ELSE
        GREATEST(0, COALESCE(p_amount, 0) - COALESCE(p_commission, 0) - COALESCE(p_tax, 0))
    END,
    2
  );
$accounting_transfer_received_amount$;

CREATE OR REPLACE FUNCTION public.accounting_sync_transfer_amounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $accounting_sync_transfer_amounts$
DECLARE
  source_account_currency VARCHAR(3);
  target_account_currency VARCHAR(3);
  net_source_amount NUMERIC;
BEGIN
  SELECT currency INTO source_account_currency
  FROM public.accounting_accounts
  WHERE id = NEW.from_account_id;

  SELECT currency INTO target_account_currency
  FROM public.accounting_accounts
  WHERE id = NEW.to_account_id;

  NEW.source_amount := ROUND(COALESCE(NEW.source_amount, NEW.amount), 2);
  NEW.source_currency := COALESCE(NEW.source_currency, source_account_currency, NEW.currency);
  NEW.amount := NEW.source_amount;
  NEW.currency := NEW.source_currency;
  NEW.fee_amount := ROUND(COALESCE(NEW.fee_amount, COALESCE(NEW.commission, 0) + COALESCE(NEW.tax, 0)), 2);
  NEW.fee_currency := COALESCE(NEW.fee_currency, NEW.source_currency);
  NEW.destination_currency := COALESCE(NEW.destination_currency, target_account_currency);
  net_source_amount := GREATEST(0, NEW.source_amount - NEW.fee_amount);

  IF NEW.destination_amount IS NOT NULL THEN
    NEW.destination_amount := ROUND(NEW.destination_amount, 2);

    IF NEW.source_currency <> NEW.destination_currency AND NEW.destination_amount > 0 THEN
      NEW.exchange_rate := CASE
        WHEN NEW.source_currency = 'ARS' AND NEW.destination_currency = 'USD'
          THEN net_source_amount / NEW.destination_amount
        WHEN NEW.source_currency = 'USD' AND NEW.destination_currency = 'ARS'
          THEN NEW.destination_amount / NULLIF(net_source_amount, 0)
        ELSE NEW.exchange_rate
      END;
    END IF;
  ELSE
    NEW.destination_amount := public.accounting_transfer_received_amount(
      NEW.source_amount,
      NEW.exchange_rate,
      NEW.commission,
      NEW.tax,
      NEW.destination_currency
    );
  END IF;

  RETURN NEW;
END;
$accounting_sync_transfer_amounts$;

UPDATE public.accounting_transfers AS t
SET
  source_amount = COALESCE(t.source_amount, t.amount),
  source_currency = COALESCE(t.source_currency, source_account.currency, t.currency),
  destination_amount = COALESCE(
    t.destination_amount,
    public.accounting_transfer_received_amount(
      t.amount,
      t.exchange_rate,
      t.commission,
      t.tax,
      destination_account.currency
    )
  ),
  destination_currency = COALESCE(t.destination_currency, destination_account.currency),
  fee_amount = COALESCE(t.fee_amount, COALESCE(t.commission, 0) + COALESCE(t.tax, 0)),
  fee_currency = COALESCE(t.fee_currency, source_account.currency, t.currency),
  is_legacy_derived = true
FROM public.accounting_accounts AS source_account,
     public.accounting_accounts AS destination_account
WHERE source_account.id = t.from_account_id
  AND destination_account.id = t.to_account_id;

DROP TRIGGER IF EXISTS trigger_accounting_sync_transfer_amounts
  ON public.accounting_transfers;
CREATE TRIGGER trigger_accounting_sync_transfer_amounts
  BEFORE INSERT OR UPDATE ON public.accounting_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.accounting_sync_transfer_amounts();

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounting_transfers_different_accounts'
      AND conrelid = 'public.accounting_transfers'::regclass
  ) THEN
    ALTER TABLE public.accounting_transfers
      ADD CONSTRAINT accounting_transfers_different_accounts
      CHECK (from_account_id IS NULL OR to_account_id IS NULL OR from_account_id <> to_account_id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounting_transfers_source_amount_positive'
      AND conrelid = 'public.accounting_transfers'::regclass
  ) THEN
    ALTER TABLE public.accounting_transfers
      ADD CONSTRAINT accounting_transfers_source_amount_positive
      CHECK (source_amount IS NULL OR source_amount > 0)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounting_transfers_destination_amount_nonnegative'
      AND conrelid = 'public.accounting_transfers'::regclass
  ) THEN
    ALTER TABLE public.accounting_transfers
      ADD CONSTRAINT accounting_transfers_destination_amount_nonnegative
      CHECK (destination_amount IS NULL OR destination_amount >= 0)
      NOT VALID;
  END IF;
END
$constraints$;

ALTER TABLE public.accounting_transfers
  VALIDATE CONSTRAINT accounting_transfers_different_accounts;
ALTER TABLE public.accounting_transfers
  VALIDATE CONSTRAINT accounting_transfers_source_amount_positive;
ALTER TABLE public.accounting_transfers
  VALIDATE CONSTRAINT accounting_transfers_destination_amount_nonnegative;

-- Existing projects historically grant EXECUTE on public functions to anon.
-- Restrict every accounting read RPC to signed-in users. Table RLS remains as
-- a second layer; no application data is changed by these grants.
DO $permissions$
DECLARE
  function_signature REGPROCEDURE;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'get_accounting_%'
        OR p.proname LIKE 'get_expense_%'
        OR p.proname LIKE 'get_future_investment%'
        OR p.proname LIKE 'get_partner_contribution%'
        OR p.proname LIKE 'get_contribution%'
        OR p.proname IN (
          'get_account_movements',
          'get_unified_history',
          'get_history_summary',
          'accounting_transfer_received_amount',
          'accounting_sync_transfer_amounts'
        )
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', function_signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', function_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', function_signature);
  END LOOP;
END
$permissions$;
