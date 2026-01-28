-- Migration 007: Asset Management, Approvals & Annotations
-- Adds: asset versions, structured approval states, visual annotations with feedback categories

-- ============ ASSETS ============
CREATE TABLE IF NOT EXISTS sistema_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES sistema_tasks(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES sistema_projects(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    current_version INTEGER DEFAULT 1,
    approval_status TEXT DEFAULT 'pending_review'
        CHECK (approval_status IN ('pending_review', 'changes_requested', 'approved_internal', 'approved_final', 'published')),
    iteration_count INTEGER DEFAULT 0,
    created_by UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ASSET VERSIONS ============
CREATE TABLE IF NOT EXISTS sistema_asset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES sistema_assets(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT, -- image/png, image/jpeg, video/mp4, application/pdf
    file_size INTEGER, -- bytes
    thumbnail_url TEXT,
    notes TEXT,
    uploaded_by UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(asset_id, version_number)
);

-- ============ ASSET ANNOTATIONS (Visual feedback) ============
CREATE TABLE IF NOT EXISTS sistema_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_version_id UUID NOT NULL REFERENCES sistema_asset_versions(id) ON DELETE CASCADE,
    author_id UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    author_name TEXT, -- for client annotations (no user account)
    -- Position on canvas (percentage-based for responsive)
    x_percent NUMERIC(5,2) NOT NULL,
    y_percent NUMERIC(5,2) NOT NULL,
    -- Feedback classification
    feedback_type TEXT NOT NULL DEFAULT 'correction_minor'
        CHECK (feedback_type IN (
            'correction_critical',
            'correction_minor',
            'aesthetic_preference',
            'doubt_question',
            'approval_love'
        )),
    contenido TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID REFERENCES sistema_users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ APPROVAL LOG (audit trail) ============
CREATE TABLE IF NOT EXISTS sistema_approval_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES sistema_assets(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by UUID NOT NULL REFERENCES sistema_users(id) ON DELETE CASCADE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_assets_task ON sistema_assets(task_id);
CREATE INDEX IF NOT EXISTS idx_assets_project ON sistema_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON sistema_assets(approval_status);
CREATE INDEX IF NOT EXISTS idx_asset_versions_asset ON sistema_asset_versions(asset_id);
CREATE INDEX IF NOT EXISTS idx_annotations_version ON sistema_annotations(asset_version_id);
CREATE INDEX IF NOT EXISTS idx_annotations_resolved ON sistema_annotations(resolved);
CREATE INDEX IF NOT EXISTS idx_approval_log_asset ON sistema_approval_log(asset_id);

-- ============ RLS ============
ALTER TABLE sistema_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_asset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sistema_approval_log ENABLE ROW LEVEL SECURITY;

-- Assets: project members can view
CREATE POLICY "Members can view assets" ON sistema_assets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_assets.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage assets" ON sistema_assets
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_assets.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Asset versions: same as assets
CREATE POLICY "Members can view asset versions" ON sistema_asset_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_assets a
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE a.id = sistema_asset_versions.asset_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage asset versions" ON sistema_asset_versions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_assets a
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE a.id = sistema_asset_versions.asset_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- Annotations: anyone who can view the asset can annotate
CREATE POLICY "Members can view annotations" ON sistema_annotations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_asset_versions av
            JOIN sistema_assets a ON a.id = av.asset_id
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE av.id = sistema_annotations.asset_version_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can manage annotations" ON sistema_annotations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_asset_versions av
            JOIN sistema_assets a ON a.id = av.asset_id
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE av.id = sistema_annotations.asset_version_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

-- Approval log: project members can view
CREATE POLICY "Members can view approval log" ON sistema_approval_log
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_assets a
            JOIN sistema_projects p ON p.id = a.project_id
            WHERE a.id = sistema_approval_log.asset_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

CREATE POLICY "Members can create approval log" ON sistema_approval_log
    FOR INSERT WITH CHECK (changed_by = auth.uid());

-- ============ TRIGGERS ============
CREATE TRIGGER update_sistema_assets_updated_at
    BEFORE UPDATE ON sistema_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- When approval_status changes, log it and update iteration_count for changes_requested
CREATE OR REPLACE FUNCTION log_approval_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
        INSERT INTO sistema_approval_log (asset_id, from_status, to_status, changed_by)
        VALUES (NEW.id, OLD.approval_status, NEW.approval_status, auth.uid());

        IF NEW.approval_status = 'changes_requested' THEN
            NEW.iteration_count = OLD.iteration_count + 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;

CREATE TRIGGER log_approval_change_trigger
    BEFORE UPDATE ON sistema_assets
    FOR EACH ROW
    EXECUTE FUNCTION log_approval_change();

-- Supabase Storage bucket for assets (run in dashboard or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('sistema-assets', 'sistema-assets', true);
