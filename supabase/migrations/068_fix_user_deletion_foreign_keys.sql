-- Ensure deleting a user does not fail because of historical foreign keys
-- that were created without ON DELETE behavior.
-- Some deployments may not have every table yet, so each fix is conditional.

DO $$
BEGIN
  IF to_regclass('public.sistema_calendar_comments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_calendar_comments DROP CONSTRAINT IF EXISTS sistema_calendar_comments_user_id_fkey';
    EXECUTE 'ALTER TABLE public.sistema_calendar_comments
      ADD CONSTRAINT sistema_calendar_comments_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_prompt_templates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_prompt_templates DROP CONSTRAINT IF EXISTS sistema_prompt_templates_user_id_fkey';
    EXECUTE 'ALTER TABLE public.sistema_prompt_templates
      ADD CONSTRAINT sistema_prompt_templates_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_crm_leads') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_crm_leads DROP CONSTRAINT IF EXISTS sistema_crm_leads_owner_id_fkey';
    EXECUTE 'ALTER TABLE public.sistema_crm_leads
      ADD CONSTRAINT sistema_crm_leads_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_client_payments') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_client_payments DROP CONSTRAINT IF EXISTS accounting_client_payments_created_by_fkey';
    EXECUTE 'ALTER TABLE public.accounting_client_payments
      ADD CONSTRAINT accounting_client_payments_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_expenses') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_expenses DROP CONSTRAINT IF EXISTS accounting_expenses_created_by_fkey';
    EXECUTE 'ALTER TABLE public.accounting_expenses
      ADD CONSTRAINT accounting_expenses_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_transfers') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_transfers DROP CONSTRAINT IF EXISTS accounting_transfers_created_by_fkey';
    EXECUTE 'ALTER TABLE public.accounting_transfers
      ADD CONSTRAINT accounting_transfers_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_proposals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_proposals DROP CONSTRAINT IF EXISTS sistema_proposals_created_by_fkey';
    EXECUTE 'ALTER TABLE public.sistema_proposals
      ADD CONSTRAINT sistema_proposals_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_proposal_templates') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_proposal_templates DROP CONSTRAINT IF EXISTS sistema_proposal_templates_created_by_fkey';
    EXECUTE 'ALTER TABLE public.sistema_proposal_templates
      ADD CONSTRAINT sistema_proposal_templates_created_by_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.sistema_users(id)
      ON DELETE SET NULL';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
