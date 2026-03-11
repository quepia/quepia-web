-- Allow task comments to represent client feedback mirrored from assets.

ALTER TABLE public.sistema_comments
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.sistema_comments
    ADD COLUMN IF NOT EXISTS author_name TEXT,
    ADD COLUMN IF NOT EXISTS is_client BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'task_comment',
    ADD COLUMN IF NOT EXISTS asset_id UUID REFERENCES public.sistema_assets(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS asset_version_id UUID REFERENCES public.sistema_asset_versions(id) ON DELETE SET NULL;

UPDATE public.sistema_comments AS comments
SET author_name = users.nombre
FROM public.sistema_users AS users
WHERE comments.user_id = users.id
  AND comments.author_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_asset_id
    ON public.sistema_comments(asset_id);

CREATE INDEX IF NOT EXISTS idx_comments_asset_version_id
    ON public.sistema_comments(asset_version_id);

NOTIFY pgrst, 'reload schema';
