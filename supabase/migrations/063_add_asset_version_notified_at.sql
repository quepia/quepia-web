-- Migration 063: Track when the latest asset version was manually notified to the client

ALTER TABLE public.sistema_asset_versions
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_asset_versions_pending_notification
  ON public.sistema_asset_versions (asset_id, version_number DESC)
  WHERE notified_at IS NULL;
