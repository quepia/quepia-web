-- 032_client_briefs.sql

-- 1. Create sistema_client_briefs table
CREATE TABLE IF NOT EXISTS sistema_client_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES sistema_projects(id) ON DELETE CASCADE,
    project_type TEXT NOT NULL,
    objectives TEXT,
    target_audience TEXT,
    tone_of_voice TEXT,
    references_text TEXT,
    budget TEXT,
    timeline TEXT,
    includes_ads BOOLEAN DEFAULT FALSE,
    ad_budget TEXT,
    platforms TEXT[],
    keep_existing_brand BOOLEAN DEFAULT FALSE,
    existing_elements TEXT,
    content_frequency TEXT,
    key_messages TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id)
);

-- 2. Enable RLS
ALTER TABLE sistema_client_briefs ENABLE ROW LEVEL SECURITY;

-- 3. Create policies (match project permissions)

-- Users can view briefs for projects they can view
CREATE POLICY "Users can view briefs" ON sistema_client_briefs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_briefs.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
            ))
        )
    );

-- Project members can insert/update briefs
CREATE POLICY "Members can manage briefs" ON sistema_client_briefs
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM sistema_projects p
            WHERE p.id = sistema_client_briefs.project_id
            AND (p.owner_id = auth.uid() OR EXISTS (
                SELECT 1 FROM sistema_project_members pm
                WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
                AND pm.role IN ('owner', 'admin', 'member')
            ))
        )
    );

-- 4. Trigger for updated_at
CREATE TRIGGER update_sistema_client_briefs_updated_at
    BEFORE UPDATE ON sistema_client_briefs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
