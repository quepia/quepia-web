-- 027_client_features_and_templates.sql

-- 1. Add logo_url to sistema_projects
ALTER TABLE sistema_projects 
ADD COLUMN IF NOT EXISTS logo_url text;

-- 2. Create sistema_prompt_templates table
CREATE TABLE IF NOT EXISTS sistema_prompt_templates (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) NOT NULL,
    name text NOT NULL,
    prompt_text text,
    industry text,
    pillars text,
    frequency text,
    platforms text[],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE sistema_prompt_templates ENABLE ROW LEVEL SECURITY;

-- 4. Create policies (Simple owner access for now)
DROP POLICY IF EXISTS "Users can view their own templates" ON sistema_prompt_templates;
CREATE POLICY "Users can view their own templates" 
ON sistema_prompt_templates 
FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own templates" ON sistema_prompt_templates;
CREATE POLICY "Users can insert their own templates" 
ON sistema_prompt_templates 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own templates" ON sistema_prompt_templates;
CREATE POLICY "Users can update their own templates" 
ON sistema_prompt_templates 
FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own templates" ON sistema_prompt_templates;
CREATE POLICY "Users can delete their own templates" 
ON sistema_prompt_templates 
FOR DELETE 
USING (auth.uid() = user_id);
