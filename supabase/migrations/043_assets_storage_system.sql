-- Migration 043: Private asset storage paths, access logs, zip cache, and revocation

-- ============ ASSET VERSIONS: STORAGE PATHS ============
ALTER TABLE sistema_asset_versions
    ADD COLUMN IF NOT EXISTS storage_path TEXT,
    ADD COLUMN IF NOT EXISTS thumbnail_path TEXT,
    ADD COLUMN IF NOT EXISTS preview_path TEXT,
    ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- ============ ASSETS: ACCESS REVOCATION ============
ALTER TABLE sistema_assets
    ADD COLUMN IF NOT EXISTS access_revoked BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS access_revoked_by UUID REFERENCES sistema_users(id) ON DELETE SET NULL;

-- ============ ASSET ACCESS LOGS ============
CREATE TABLE IF NOT EXISTS sistema_asset_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES sistema_assets(id) ON DELETE SET NULL,
    asset_version_id UUID REFERENCES sistema_asset_versions(id) ON DELETE SET NULL,
    project_id UUID REFERENCES sistema_projects(id) ON DELETE SET NULL,
    task_id UUID REFERENCES sistema_tasks(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    client_access_id UUID REFERENCES sistema_client_access(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('view', 'download', 'zip')),
    source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('admin', 'client')),
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_access_logs_asset ON sistema_asset_access_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_logs_version ON sistema_asset_access_logs(asset_version_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_logs_task ON sistema_asset_access_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_asset_access_logs_project ON sistema_asset_access_logs(project_id);

-- ============ ZIP CACHE ============
CREATE TABLE IF NOT EXISTS sistema_asset_zip_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    zip_path TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_by UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    client_access_id UUID REFERENCES sistema_client_access(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_zip_cache_task ON sistema_asset_zip_cache(task_id);
CREATE INDEX IF NOT EXISTS idx_asset_zip_cache_expires ON sistema_asset_zip_cache(expires_at);

-- ============ STORAGE BUCKET ============
-- Private bucket for assets and derived files
INSERT INTO storage.buckets (id, name, public)
VALUES ('sistema-assets', 'sistema-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for authenticated uploads
DROP POLICY IF EXISTS "Authenticated uploads to sistema-assets" ON storage.objects;
CREATE POLICY "Authenticated uploads to sistema-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sistema-assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Owner can delete sistema-assets" ON storage.objects;
CREATE POLICY "Owner can delete sistema-assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'sistema-assets' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Owner can update sistema-assets" ON storage.objects;
CREATE POLICY "Owner can update sistema-assets"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'sistema-assets' AND auth.uid() = owner);

-- RLS for logs & zip cache (optional - kept minimal)
ALTER TABLE sistema_asset_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_asset_zip_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view asset logs" ON sistema_asset_access_logs;
CREATE POLICY "Members can view asset logs" ON sistema_asset_access_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sistema_projects p
      WHERE p.id = sistema_asset_access_logs.project_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM sistema_project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

DROP POLICY IF EXISTS "Members can view zip cache" ON sistema_asset_zip_cache;
CREATE POLICY "Members can view zip cache" ON sistema_asset_zip_cache
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sistema_projects p
      WHERE p.id = sistema_asset_zip_cache.project_id
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM sistema_project_members pm
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );
