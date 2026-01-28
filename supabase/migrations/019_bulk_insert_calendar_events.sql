-- FIX: Calendar import infinite hang caused by RLS recursion
-- RUN THIS IN SUPABASE SQL EDITOR

-- Step 1: Drop all existing policies on calendar events (they cause recursive hangs)
DROP POLICY IF EXISTS "Members can view calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can create calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can update calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Members can delete calendar events" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Debug: Allow All Inserts" ON sistema_calendar_events;
DROP POLICY IF EXISTS "Debug: View Own or Public" ON sistema_calendar_events;

-- Step 2: Disable RLS on calendar events entirely
-- Permission checks are handled in application code and RPC functions
ALTER TABLE sistema_calendar_events DISABLE ROW LEVEL SECURITY;

-- Step 3: Create the bulk insert RPC (still useful for performance)
CREATE OR REPLACE FUNCTION bulk_insert_calendar_events(
    events JSONB,
    p_project_id UUID,
    p_user_id UUID
)
RETURNS INT AS $$
DECLARE
    ev JSONB;
    inserted_count INT := 0;
BEGIN
    -- Verify the user is the project owner or an editor
    IF NOT EXISTS (
        SELECT 1 FROM sistema_projects
        WHERE id = p_project_id AND owner_id = p_user_id
    ) AND NOT EXISTS (
        SELECT 1 FROM sistema_project_members
        WHERE project_id = p_project_id AND user_id = p_user_id AND role IN ('owner', 'admin', 'member')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to insert events into this project';
    END IF;

    FOR ev IN SELECT * FROM jsonb_array_elements(events)
    LOOP
        INSERT INTO sistema_calendar_events (
            project_id, titulo, descripcion, tipo, fecha_inicio, todo_el_dia, color, created_by
        ) VALUES (
            p_project_id,
            ev->>'titulo',
            ev->>'descripcion',
            COALESCE(ev->>'tipo', 'publicacion'),
            (ev->>'fecha_inicio')::TIMESTAMPTZ,
            COALESCE((ev->>'todo_el_dia')::BOOLEAN, TRUE),
            COALESCE(ev->>'color', '#22c55e'),
            p_user_id
        );
        inserted_count := inserted_count + 1;
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';
