BEGIN;

CREATE TABLE IF NOT EXISTS public.sistema_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  website_url TEXT CHECK (website_url IS NULL OR char_length(website_url) <= 2048),
  category TEXT NOT NULL DEFAULT 'direct'
    CHECK (category IN ('direct', 'indirect', 'local', 'aspirational')),
  notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 4000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sistema_competitors_project_name
  ON public.sistema_competitors (project_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_sistema_competitors_project_active
  ON public.sistema_competitors (project_id, is_active, created_at);

CREATE TABLE IF NOT EXISTS public.sistema_research_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  research_type TEXT NOT NULL DEFAULT 'competitor_analysis'
    CHECK (research_type IN ('competitor_analysis')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  model_id TEXT,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistema_research_runs_project_created
  ON public.sistema_research_runs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_research_runs_project_status
  ON public.sistema_research_runs (project_id, status);

CREATE TABLE IF NOT EXISTS public.sistema_strategy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'product_information',
      'marketing_strategy',
      'competitor_analysis',
      'brand_voice',
      'content_strategy'
    )),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'reviewed', 'published', 'archived')),
  version INTEGER NOT NULL CHECK (version > 0),
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_run_id UUID REFERENCES public.sistema_research_runs(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, document_type, version)
);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_latest
  ON public.sistema_strategy_documents (project_id, document_type, version DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_published
  ON public.sistema_strategy_documents (project_id, status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.sistema_research_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.sistema_research_runs(id) ON DELETE CASCADE,
  title TEXT,
  url TEXT NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  source_type TEXT NOT NULL DEFAULT 'web'
    CHECK (source_type IN ('web', 'client_site', 'competitor_site', 'manual')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, url)
);

CREATE INDEX IF NOT EXISTS idx_sistema_research_sources_run
  ON public.sistema_research_sources (run_id, created_at);

CREATE TABLE IF NOT EXISTS public.sistema_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.sistema_strategy_documents(id) ON DELETE SET NULL,
  source_run_id UUID REFERENCES public.sistema_research_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 8000),
  impact TEXT NOT NULL DEFAULT 'medium'
    CHECK (impact IN ('high', 'medium', 'low')),
  effort TEXT NOT NULL DEFAULT 'medium'
    CHECK (effort IN ('high', 'medium', 'low')),
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'planned', 'in_progress', 'done', 'dismissed')),
  linked_task_id UUID REFERENCES public.sistema_tasks(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sistema_opportunities_project_status
  ON public.sistema_opportunities (project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_opportunities_document
  ON public.sistema_opportunities (document_id);

DROP TRIGGER IF EXISTS update_sistema_competitors_updated_at ON public.sistema_competitors;
CREATE TRIGGER update_sistema_competitors_updated_at
  BEFORE UPDATE ON public.sistema_competitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_research_runs_updated_at ON public.sistema_research_runs;
CREATE TRIGGER update_sistema_research_runs_updated_at
  BEFORE UPDATE ON public.sistema_research_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_strategy_documents_updated_at ON public.sistema_strategy_documents;
CREATE TRIGGER update_sistema_strategy_documents_updated_at
  BEFORE UPDATE ON public.sistema_strategy_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_sistema_opportunities_updated_at ON public.sistema_opportunities;
CREATE TRIGGER update_sistema_opportunities_updated_at
  BEFORE UPDATE ON public.sistema_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sistema_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_strategy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_research_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_opportunities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sistema_competitors FROM anon;
REVOKE ALL ON TABLE public.sistema_research_runs FROM anon;
REVOKE ALL ON TABLE public.sistema_strategy_documents FROM anon;
REVOKE ALL ON TABLE public.sistema_research_sources FROM anon;
REVOKE ALL ON TABLE public.sistema_opportunities FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_competitors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_research_runs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_strategy_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_research_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_opportunities TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_competitors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_research_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_strategy_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_research_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sistema_opportunities TO service_role;

CREATE POLICY sistema_competitors_select
ON public.sistema_competitors
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_competitors_insert
ON public.sistema_competitors
FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND public.sistema_can_write_project(project_id, (SELECT auth.uid()))
);

CREATE POLICY sistema_competitors_update
ON public.sistema_competitors
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())))
WITH CHECK (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_competitors_delete
ON public.sistema_competitors
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_research_runs_select
ON public.sistema_research_runs
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_research_runs_insert
ON public.sistema_research_runs
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = (SELECT auth.uid())
  AND public.sistema_can_write_project(project_id, (SELECT auth.uid()))
);

CREATE POLICY sistema_research_runs_update
ON public.sistema_research_runs
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())))
WITH CHECK (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_research_runs_delete
ON public.sistema_research_runs
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_strategy_documents_select
ON public.sistema_strategy_documents
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_strategy_documents_insert
ON public.sistema_strategy_documents
FOR INSERT TO authenticated
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND (
    source_run_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_research_runs run
      WHERE run.id = source_run_id
        AND run.project_id = sistema_strategy_documents.project_id
    )
  )
);

CREATE POLICY sistema_strategy_documents_update
ON public.sistema_strategy_documents
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())))
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND (
    source_run_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_research_runs run
      WHERE run.id = source_run_id
        AND run.project_id = sistema_strategy_documents.project_id
    )
  )
);

CREATE POLICY sistema_strategy_documents_delete
ON public.sistema_strategy_documents
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_research_sources_select
ON public.sistema_research_sources
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_research_sources_insert
ON public.sistema_research_sources
FOR INSERT TO authenticated
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.sistema_research_runs run
    WHERE run.id = run_id
      AND run.project_id = sistema_research_sources.project_id
  )
);

CREATE POLICY sistema_research_sources_update
ON public.sistema_research_sources
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())))
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.sistema_research_runs run
    WHERE run.id = run_id
      AND run.project_id = sistema_research_sources.project_id
  )
);

CREATE POLICY sistema_research_sources_delete
ON public.sistema_research_sources
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_opportunities_select
ON public.sistema_opportunities
FOR SELECT TO authenticated
USING (public.sistema_can_access_project(project_id, (SELECT auth.uid())));

CREATE POLICY sistema_opportunities_insert
ON public.sistema_opportunities
FOR INSERT TO authenticated
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND (
    document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_strategy_documents document
      WHERE document.id = document_id
        AND document.project_id = sistema_opportunities.project_id
    )
  )
  AND (
    source_run_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_research_runs run
      WHERE run.id = source_run_id
        AND run.project_id = sistema_opportunities.project_id
    )
  )
  AND (
    linked_task_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_tasks task
      WHERE task.id = linked_task_id
        AND task.project_id = sistema_opportunities.project_id
    )
  )
);

CREATE POLICY sistema_opportunities_update
ON public.sistema_opportunities
FOR UPDATE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())))
WITH CHECK (
  public.sistema_can_write_project(project_id, (SELECT auth.uid()))
  AND (
    document_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_strategy_documents document
      WHERE document.id = document_id
        AND document.project_id = sistema_opportunities.project_id
    )
  )
  AND (
    source_run_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_research_runs run
      WHERE run.id = source_run_id
        AND run.project_id = sistema_opportunities.project_id
    )
  )
  AND (
    linked_task_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.sistema_tasks task
      WHERE task.id = linked_task_id
        AND task.project_id = sistema_opportunities.project_id
    )
  )
);

CREATE POLICY sistema_opportunities_delete
ON public.sistema_opportunities
FOR DELETE TO authenticated
USING (public.sistema_can_write_project(project_id, (SELECT auth.uid())));

COMMENT ON TABLE public.sistema_competitors IS
  'Competitors tracked independently for each Quepia client project.';
COMMENT ON TABLE public.sistema_research_runs IS
  'Auditable research jobs that generate project strategy documents.';
COMMENT ON TABLE public.sistema_strategy_documents IS
  'Versioned strategic documents. Only reviewed or published versions should be shared externally.';
COMMENT ON TABLE public.sistema_research_sources IS
  'Evidence URLs captured for a research run.';
COMMENT ON TABLE public.sistema_opportunities IS
  'Prioritized strategic opportunities that can be converted into project tasks.';

COMMIT;

NOTIFY pgrst, 'reload schema';
