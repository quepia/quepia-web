-- Expense analytics foundation.
-- Additive migration: original expenses, descriptions, providers, categories,
-- amounts, currencies and dates are preserved byte-for-byte.

CREATE TABLE IF NOT EXISTS public.accounting_counterparties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'vendor'
    CHECK (kind IN ('team_member', 'freelancer', 'vendor', 'partner', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounting_counterparties_name_normalized_idx
  ON public.accounting_counterparties (LOWER(BTRIM(name)));

ALTER TABLE public.accounting_counterparties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_counterparties_authenticated_read
  ON public.accounting_counterparties;
CREATE POLICY accounting_counterparties_authenticated_read
  ON public.accounting_counterparties
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS accounting_counterparties_admin_manage
  ON public.accounting_counterparties;
CREATE POLICY accounting_counterparties_admin_manage
  ON public.accounting_counterparties
  FOR ALL TO authenticated
  USING (public.sistema_is_admin(auth.uid()))
  WITH CHECK (public.sistema_is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.accounting_counterparties TO authenticated;
REVOKE ALL ON public.accounting_counterparties FROM anon;

ALTER TABLE public.accounting_expenses
  ADD COLUMN IF NOT EXISTS counterparty_id UUID
    REFERENCES public.accounting_counterparties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID
    REFERENCES public.sistema_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS classification_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(4, 3);

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounting_expenses_expense_type_check'
      AND conrelid = 'public.accounting_expenses'::regclass
  ) THEN
    ALTER TABLE public.accounting_expenses
      ADD CONSTRAINT accounting_expenses_expense_type_check
      CHECK (
        expense_type IS NULL OR expense_type IN (
          'salary', 'project_fee', 'advance', 'bonus', 'reimbursement',
          'subscription', 'tax', 'service', 'purchase', 'other'
        )
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounting_expenses_classification_confidence_check'
      AND conrelid = 'public.accounting_expenses'::regclass
  ) THEN
    ALTER TABLE public.accounting_expenses
      ADD CONSTRAINT accounting_expenses_classification_confidence_check
      CHECK (
        classification_confidence IS NULL
        OR classification_confidence BETWEEN 0 AND 1
      ) NOT VALID;
  END IF;
END
$constraints$;

ALTER TABLE public.accounting_expenses
  VALIDATE CONSTRAINT accounting_expenses_expense_type_check;
ALTER TABLE public.accounting_expenses
  VALIDATE CONSTRAINT accounting_expenses_classification_confidence_check;

CREATE INDEX IF NOT EXISTS accounting_expenses_counterparty_idx
  ON public.accounting_expenses(counterparty_id);
CREATE INDEX IF NOT EXISTS accounting_expenses_project_idx
  ON public.accounting_expenses(project_id);
CREATE INDEX IF NOT EXISTS accounting_expenses_type_date_idx
  ON public.accounting_expenses(expense_type, date DESC);
CREATE INDEX IF NOT EXISTS accounting_expenses_period_idx
  ON public.accounting_expenses(period_start)
  WHERE period_start IS NOT NULL;

-- Seed known team members and every existing free-text provider. Conflicts are
-- ignored by the normalized-name index, preserving existing counterparties.
INSERT INTO public.accounting_counterparties (name, kind)
VALUES
  ('Cami', 'team_member'),
  ('Lauti', 'team_member')
ON CONFLICT DO NOTHING;

INSERT INTO public.accounting_counterparties (name, kind)
SELECT DISTINCT BTRIM(e.provider), 'vendor'
FROM public.accounting_expenses AS e
WHERE NULLIF(BTRIM(e.provider), '') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Link existing provider values without changing the provider text.
UPDATE public.accounting_expenses AS e
SET
  counterparty_id = c.id,
  classification_source = COALESCE(e.classification_source, 'legacy_provider'),
  classification_confidence = COALESCE(e.classification_confidence, 1)
FROM public.accounting_counterparties AS c
WHERE e.counterparty_id IS NULL
  AND NULLIF(BTRIM(e.provider), '') IS NOT NULL
  AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(e.provider));

-- Recover team-member history from descriptions. The source description is
-- retained for audit and the inferred fields can be reviewed in the UI.
UPDATE public.accounting_expenses AS e
SET
  counterparty_id = c.id,
  expense_type = CASE
    WHEN e.description ILIKE '%adelanto%' THEN 'advance'
    WHEN e.description ILIKE ANY (ARRAY['%brandalise%', '%noe%', '%manual de marca%']) THEN 'project_fee'
    ELSE 'salary'
  END,
  period_start = DATE_TRUNC('month', e.date)::DATE,
  classification_source = 'legacy_rule',
  classification_confidence = 0.950
FROM public.accounting_counterparties AS c
JOIN public.accounting_expense_categories AS category
  ON category.name = 'Sueldos'
WHERE e.category_id = category.id
  AND e.counterparty_id IS NULL
  AND (
    (e.description ILIKE '%cami%' AND LOWER(c.name) = 'cami')
    OR
    (e.description ILIKE '%lauti%' AND LOWER(c.name) = 'lauti')
  );

-- Classify any remaining salary row conservatively; it stays visible as
-- unassigned until a person is selected manually.
UPDATE public.accounting_expenses AS e
SET
  expense_type = COALESCE(e.expense_type, 'salary'),
  period_start = COALESCE(e.period_start, DATE_TRUNC('month', e.date)::DATE),
  classification_source = COALESCE(e.classification_source, 'legacy_category'),
  classification_confidence = COALESCE(e.classification_confidence, 0.700)
FROM public.accounting_expense_categories AS category
WHERE e.category_id = category.id
  AND category.name = 'Sueldos';

CREATE OR REPLACE FUNCTION public.get_accounting_expenses_v2(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  date DATE,
  category_id UUID,
  category_name VARCHAR,
  category_color VARCHAR,
  subcategory_id UUID,
  subcategory_name VARCHAR,
  account_id UUID,
  account_name VARCHAR,
  account_color VARCHAR,
  counterparty_id UUID,
  counterparty_name VARCHAR,
  counterparty_kind VARCHAR,
  project_id UUID,
  project_name VARCHAR,
  description TEXT,
  amount DECIMAL,
  currency VARCHAR,
  expense_type VARCHAR,
  period_start DATE,
  classification_source VARCHAR,
  classification_confidence DECIMAL,
  provider VARCHAR,
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $get_accounting_expenses_v2$
  SELECT
    e.id,
    e.date,
    e.category_id,
    category.name::VARCHAR,
    category.color::VARCHAR,
    e.subcategory_id,
    subcategory.name::VARCHAR,
    e.account_id,
    account.name::VARCHAR,
    account.color::VARCHAR,
    e.counterparty_id,
    counterparty.name::VARCHAR,
    counterparty.kind::VARCHAR,
    e.project_id,
    project.nombre::VARCHAR,
    e.description,
    e.amount,
    e.currency::VARCHAR,
    e.expense_type::VARCHAR,
    e.period_start,
    e.classification_source::VARCHAR,
    e.classification_confidence,
    e.provider::VARCHAR,
    e.receipt_url,
    e.notes,
    e.created_at
  FROM public.accounting_expenses AS e
  LEFT JOIN public.accounting_expense_categories AS category ON category.id = e.category_id
  LEFT JOIN public.accounting_expense_subcategories AS subcategory ON subcategory.id = e.subcategory_id
  LEFT JOIN public.accounting_accounts AS account ON account.id = e.account_id
  LEFT JOIN public.accounting_counterparties AS counterparty ON counterparty.id = e.counterparty_id
  LEFT JOIN public.sistema_projects AS project ON project.id = e.project_id
  WHERE (p_start_date IS NULL OR e.date >= p_start_date)
    AND (p_end_date IS NULL OR e.date <= p_end_date)
    AND (p_category_id IS NULL OR e.category_id = p_category_id)
    AND (p_account_id IS NULL OR e.account_id = p_account_id)
  ORDER BY e.date DESC, e.created_at DESC;
$get_accounting_expenses_v2$;

CREATE OR REPLACE FUNCTION public.get_expense_analytics(
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_currency VARCHAR DEFAULT 'ARS'
)
RETURNS JSONB
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $get_expense_analytics$
  WITH filtered AS (
    SELECT
      e.*,
      category.name AS category_name,
      subcategory.name AS subcategory_name,
      counterparty.name AS counterparty_name,
      counterparty.kind AS counterparty_kind
    FROM public.accounting_expenses AS e
    LEFT JOIN public.accounting_expense_categories AS category ON category.id = e.category_id
    LEFT JOIN public.accounting_expense_subcategories AS subcategory ON subcategory.id = e.subcategory_id
    LEFT JOIN public.accounting_counterparties AS counterparty ON counterparty.id = e.counterparty_id
    WHERE EXTRACT(YEAR FROM e.date) = p_year
      AND e.date <= CURRENT_DATE
      AND (p_currency IS NULL OR e.currency = p_currency)
  )
  SELECT jsonb_build_object(
    'year', p_year,
    'currency', p_currency,
    'total_amount', COALESCE((SELECT SUM(amount) FROM filtered), 0),
    'expense_count', (SELECT COUNT(*) FROM filtered),
    'classified_count', (SELECT COUNT(*) FROM filtered WHERE counterparty_id IS NOT NULL),
    'unclassified_count', (SELECT COUNT(*) FROM filtered WHERE counterparty_id IS NULL),
    'by_category', COALESCE((
      SELECT jsonb_agg(to_jsonb(grouped) ORDER BY grouped.total_amount DESC)
      FROM (
        SELECT
          category_id AS id,
          COALESCE(category_name, 'Sin categoría') AS label,
          COUNT(*) AS expense_count,
          SUM(amount) AS total_amount
        FROM filtered
        GROUP BY category_id, category_name
      ) AS grouped
    ), '[]'::jsonb),
    'by_counterparty', COALESCE((
      SELECT jsonb_agg(to_jsonb(grouped) ORDER BY grouped.total_amount DESC)
      FROM (
        SELECT
          counterparty_id AS id,
          COALESCE(counterparty_name, 'Sin persona/proveedor') AS label,
          COALESCE(counterparty_kind, 'unclassified') AS kind,
          COUNT(*) AS expense_count,
          SUM(amount) AS total_amount
        FROM filtered
        GROUP BY counterparty_id, counterparty_name, counterparty_kind
      ) AS grouped
    ), '[]'::jsonb),
    'by_type', COALESCE((
      SELECT jsonb_agg(to_jsonb(grouped) ORDER BY grouped.total_amount DESC)
      FROM (
        SELECT
          COALESCE(expense_type, 'other') AS id,
          COUNT(*) AS expense_count,
          SUM(amount) AS total_amount
        FROM filtered
        GROUP BY COALESCE(expense_type, 'other')
      ) AS grouped
    ), '[]'::jsonb),
    'monthly', COALESCE((
      SELECT jsonb_agg(to_jsonb(grouped) ORDER BY grouped.month)
      FROM (
        SELECT
          EXTRACT(MONTH FROM date)::INTEGER AS month,
          COUNT(*) AS expense_count,
          SUM(amount) AS total_amount
        FROM filtered
        GROUP BY EXTRACT(MONTH FROM date)
      ) AS grouped
    ), '[]'::jsonb),
    'salary_by_person', COALESCE((
      SELECT jsonb_agg(to_jsonb(grouped) ORDER BY grouped.total_amount DESC)
      FROM (
        SELECT
          counterparty_id AS id,
          COALESCE(counterparty_name, 'Sin persona') AS label,
          COUNT(*) AS payment_count,
          SUM(amount) AS total_amount,
          SUM(amount) FILTER (WHERE expense_type = 'salary') AS salary_amount,
          SUM(amount) FILTER (WHERE expense_type = 'project_fee') AS project_fee_amount,
          SUM(amount) FILTER (WHERE expense_type = 'advance') AS advance_amount,
          MIN(date) AS first_payment_date,
          MAX(date) AS last_payment_date
        FROM filtered
        WHERE category_name = 'Sueldos'
        GROUP BY counterparty_id, counterparty_name
      ) AS grouped
    ), '[]'::jsonb)
  );
$get_expense_analytics$;

REVOKE EXECUTE ON FUNCTION public.get_accounting_expenses_v2(DATE, DATE, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_accounting_expenses_v2(DATE, DATE, UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_expense_analytics(INTEGER, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expense_analytics(INTEGER, VARCHAR) TO authenticated;
