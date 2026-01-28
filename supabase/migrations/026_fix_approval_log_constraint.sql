-- Migration 026: Fix approval log constraint for public client actions

-- 1. Make changed_by nullable in sistema_approval_log
ALTER TABLE sistema_approval_log ALTER COLUMN changed_by DROP NOT NULL;

-- 2. Add client_name column to track who made the change if not a system user
ALTER TABLE sistema_approval_log ADD COLUMN IF NOT EXISTS client_name TEXT;

-- 3. Update the trigger function to handle null auth.uid()
CREATE OR REPLACE FUNCTION log_approval_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
        INSERT INTO sistema_approval_log (asset_id, from_status, to_status, changed_by, client_name)
        VALUES (
            NEW.id, 
            OLD.approval_status, 
            NEW.approval_status, 
            auth.uid(), -- Will be NULL for public access
            current_setting('request.headers', true)::json->>'x-client-name' -- Ops: We can't easily get this from trigger context without passing it down.
            -- For now, we accept NULL changed_by. The app logic handles the status update.
        );

        IF NEW.approval_status = 'changes_requested' THEN
            NEW.iteration_count = OLD.iteration_count + 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql' SECURITY DEFINER;
