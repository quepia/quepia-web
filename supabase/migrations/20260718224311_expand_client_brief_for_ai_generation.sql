-- Extend project briefs into a structured creative-direction source for AI image generation.
-- Existing columns remain untouched so older briefs continue to work.

ALTER TABLE sistema_client_briefs
    ADD COLUMN IF NOT EXISTS brand_name TEXT,
    ADD COLUMN IF NOT EXISTS industry TEXT,
    ADD COLUMN IF NOT EXISTS brand_description TEXT,
    ADD COLUMN IF NOT EXISTS value_proposition TEXT,
    ADD COLUMN IF NOT EXISTS brand_personality TEXT[],
    ADD COLUMN IF NOT EXISTS visual_style_keywords TEXT[],
    ADD COLUMN IF NOT EXISTS color_palette JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS typography TEXT,
    ADD COLUMN IF NOT EXISTS logo_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS logo_file_name TEXT,
    ADD COLUMN IF NOT EXISTS image_direction TEXT,
    ADD COLUMN IF NOT EXISTS photography_style TEXT,
    ADD COLUMN IF NOT EXISTS composition_guidelines TEXT,
    ADD COLUMN IF NOT EXISTS must_include TEXT,
    ADD COLUMN IF NOT EXISTS avoid_elements TEXT,
    ADD COLUMN IF NOT EXISTS reference_links JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS output_formats TEXT[],
    ADD COLUMN IF NOT EXISTS ai_generation_notes TEXT;

COMMENT ON COLUMN sistema_client_briefs.color_palette IS
    'Ordered JSON array of brand colors: [{"name":"Primary","hex":"#00FFFF","usage":"Backgrounds"}]';
COMMENT ON COLUMN sistema_client_briefs.reference_links IS
    'JSON array of curated visual references: [{"url":"https://...","note":"What to borrow"}]';
COMMENT ON COLUMN sistema_client_briefs.logo_storage_path IS
    'Private path in the sistema-assets bucket; generate a signed URL before displaying or sending to an AI provider';

-- Signed URLs still require SELECT permission. Brief logos live under
-- briefs/{project_id}/... and are only readable by members of that project.
DROP POLICY IF EXISTS "Project members can read brief brand files" ON storage.objects;
CREATE POLICY "Project members can read brief brand files"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'sistema-assets'
        AND (storage.foldername(name))[1] = 'briefs'
        AND EXISTS (
            SELECT 1
            FROM sistema_projects p
            WHERE p.id::text = (storage.foldername(name))[2]
              AND (
                  p.owner_id = (SELECT auth.uid())
                  OR EXISTS (
                      SELECT 1
                      FROM sistema_project_members pm
                      WHERE pm.project_id = p.id
                        AND pm.user_id = (SELECT auth.uid())
                  )
              )
        )
    );
