-- Store Google Drive backup metadata for notified asset versions.

ALTER TABLE public.sistema_asset_versions
    ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
    ADD COLUMN IF NOT EXISTS drive_web_view_link TEXT,
    ADD COLUMN IF NOT EXISTS drive_month_folder_id TEXT,
    ADD COLUMN IF NOT EXISTS drive_month_folder_link TEXT,
    ADD COLUMN IF NOT EXISTS drive_backup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS drive_backup_error TEXT;

CREATE INDEX IF NOT EXISTS idx_asset_versions_drive_file_id
    ON public.sistema_asset_versions (drive_file_id)
    WHERE drive_file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_asset_versions_drive_month_folder_id
    ON public.sistema_asset_versions (drive_month_folder_id)
    WHERE drive_month_folder_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
