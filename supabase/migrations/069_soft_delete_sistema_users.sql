ALTER TABLE public.sistema_users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL;

UPDATE public.sistema_users
SET is_active = TRUE
WHERE is_active IS NULL;

ALTER TABLE public.sistema_users
  DROP CONSTRAINT IF EXISTS system_users_email_key;

ALTER TABLE public.sistema_users
  DROP CONSTRAINT IF EXISTS sistema_users_email_key;

DROP INDEX IF EXISTS public.system_users_email_key;
DROP INDEX IF EXISTS public.sistema_users_email_key;
DROP INDEX IF EXISTS public.sistema_users_active_email_key;

CREATE UNIQUE INDEX sistema_users_active_email_key
  ON public.sistema_users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sistema_users_is_active
  ON public.sistema_users (is_active);

NOTIFY pgrst, 'reload schema';
