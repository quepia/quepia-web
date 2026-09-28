-- Independent archive: snapshots deliberately survive deletion of source tasks/assets.
-- Accessible only through server routes that validate an active global administrator.
CREATE TABLE public.sistema_monthly_backups (
  version_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  project_name text NOT NULL,
  asset_name text NOT NULL,
  source_created_at timestamptz NOT NULL,
  month_key text NOT NULL CHECK (month_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'backed_up', 'error')),
  drive_file_id text,
  drive_folder_id text,
  backed_up_at timestamptz,
  verified_at timestamptz,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backed_up_has_file CHECK (status <> 'backed_up' OR (drive_file_id IS NOT NULL AND drive_folder_id IS NOT NULL))
);
CREATE INDEX sistema_monthly_backups_pending ON public.sistema_monthly_backups (next_attempt_at, source_created_at) WHERE status <> 'backed_up';
CREATE INDEX sistema_monthly_backups_project_month ON public.sistema_monthly_backups (project_id, month_key);
ALTER TABLE public.sistema_monthly_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sistema_monthly_backups FROM anon, authenticated;
GRANT ALL ON public.sistema_monthly_backups TO service_role;

CREATE TABLE public.sistema_monthly_backup_worker (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  owner uuid,
  expires_at timestamptz NOT NULL DEFAULT '-infinity',
  last_run_at timestamptz,
  last_error text
);
INSERT INTO public.sistema_monthly_backup_worker (id) VALUES (true);
ALTER TABLE public.sistema_monthly_backup_worker ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sistema_monthly_backup_worker FROM anon, authenticated;
GRANT ALL ON public.sistema_monthly_backup_worker TO service_role;
NOTIFY pgrst, 'reload schema';
