-- Zernio phase one: project profiles, connected accounts and publication history.
-- These tables are intentionally server-only. Authenticated browser clients use
-- the /api/zernio route handlers, which validate the current Quepia session and
-- project permissions before using the service-role client.

CREATE TABLE IF NOT EXISTS public.sistema_zernio_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  zernio_profile_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sistema_zernio_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES public.sistema_zernio_profiles(id) ON DELETE CASCADE,
  zernio_account_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  profile_picture TEXT,
  profile_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  needs_reconnection BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sistema_zernio_publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.sistema_tasks(id) ON DELETE CASCADE,
  zernio_post_id TEXT UNIQUE,
  request_id UUID NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  scheduled_for TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Cordoba',
  status TEXT NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'draft', 'scheduled', 'publishing', 'published', 'partial', 'failed', 'cancelled')),
  account_ids TEXT[] NOT NULL DEFAULT '{}',
  asset_ids UUID[] NOT NULL DEFAULT '{}',
  platform_results JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  created_by UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zernio_accounts_integration
  ON public.sistema_zernio_accounts(integration_id, platform);

CREATE INDEX IF NOT EXISTS idx_zernio_publications_task_created
  ON public.sistema_zernio_publications(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_zernio_publications_project_status
  ON public.sistema_zernio_publications(project_id, status);

ALTER TABLE public.sistema_zernio_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_zernio_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_zernio_publications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sistema_zernio_profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.sistema_zernio_accounts FROM anon, authenticated;
REVOKE ALL ON TABLE public.sistema_zernio_publications FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_zernio_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_zernio_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_zernio_publications TO service_role;
