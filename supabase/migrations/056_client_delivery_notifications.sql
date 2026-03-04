-- 056_client_delivery_notifications.sql
-- Add per-client delivery notification settings.

ALTER TABLE public.sistema_client_access
  ADD COLUMN IF NOT EXISTS notify_asset_delivery boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_email text;

-- Backfill existing rows to keep behavior enabled by default.
UPDATE public.sistema_client_access
SET delivery_email = email
WHERE delivery_email IS NULL;

CREATE INDEX IF NOT EXISTS idx_sistema_client_access_delivery_notifications
  ON public.sistema_client_access (project_id, notify_asset_delivery)
  WHERE notify_asset_delivery = true;
