BEGIN;

CREATE INDEX IF NOT EXISTS idx_sistema_competitors_created_by
  ON public.sistema_competitors (created_by);

CREATE INDEX IF NOT EXISTS idx_sistema_research_runs_requested_by
  ON public.sistema_research_runs (requested_by);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_source_run
  ON public.sistema_strategy_documents (source_run_id);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_generated_by
  ON public.sistema_strategy_documents (generated_by);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_reviewed_by
  ON public.sistema_strategy_documents (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_sistema_strategy_documents_published_by
  ON public.sistema_strategy_documents (published_by);

CREATE INDEX IF NOT EXISTS idx_sistema_research_sources_project
  ON public.sistema_research_sources (project_id);

CREATE INDEX IF NOT EXISTS idx_sistema_opportunities_source_run
  ON public.sistema_opportunities (source_run_id);

CREATE INDEX IF NOT EXISTS idx_sistema_opportunities_linked_task
  ON public.sistema_opportunities (linked_task_id);

CREATE INDEX IF NOT EXISTS idx_sistema_opportunities_created_by
  ON public.sistema_opportunities (created_by);

COMMIT;
