-- Cache multimodal content analysis per immutable asset version.
-- RLS remains governed by the existing sistema_asset_versions policies.

ALTER TABLE public.sistema_asset_versions
  ADD COLUMN IF NOT EXISTS ai_content_analysis JSONB,
  ADD COLUMN IF NOT EXISTS ai_content_analyzed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_content_analysis_model TEXT;

COMMENT ON COLUMN public.sistema_asset_versions.ai_content_analysis IS
  'Structured visual/audio analysis used as source context by the Copy/SEO copilot.';

COMMENT ON COLUMN public.sistema_asset_versions.ai_content_analyzed_at IS
  'Timestamp of the latest successful AI content analysis for this asset version.';

COMMENT ON COLUMN public.sistema_asset_versions.ai_content_analysis_model IS
  'Model identifier used to produce ai_content_analysis.';

NOTIFY pgrst, 'reload schema';
