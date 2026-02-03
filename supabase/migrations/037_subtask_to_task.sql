-- Migration 037: Convert Subtask to Task Feature
-- Adds parent_task_id to track tasks that were converted from subtasks

-- ============ ADD PARENT TASK ID ============
ALTER TABLE sistema_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES sistema_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON sistema_tasks(parent_task_id);

-- ============ FUNCTION TO CONVERT SUBTASK TO TASK ============
CREATE OR REPLACE FUNCTION convert_subtask_to_task(
    p_subtask_id UUID,
    p_column_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_subtask RECORD;
    v_parent_task RECORD;
    v_new_task_id UUID;
    v_max_orden INTEGER;
BEGIN
    -- Get subtask info
    SELECT * INTO v_subtask
    FROM sistema_subtasks
    WHERE id = p_subtask_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subtask not found';
    END IF;
    
    -- Get parent task info for project_id
    SELECT * INTO v_parent_task
    FROM sistema_tasks
    WHERE id = v_subtask.task_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent task not found';
    END IF;
    
    -- Get max orden for the column
    SELECT COALESCE(MAX(orden), 0) INTO v_max_orden
    FROM sistema_tasks
    WHERE column_id = p_column_id;
    
    -- Create new task from subtask
    INSERT INTO sistema_tasks (
        project_id,
        column_id,
        titulo,
        descripcion,
        assignee_id,
        priority,
        orden,
        completed,
        parent_task_id,
        created_at,
        updated_at
    ) VALUES (
        v_parent_task.project_id,
        p_column_id,
        v_subtask.titulo,
        NULL, -- No description from subtask
        v_subtask.assignee_id,
        'P4', -- Default priority
        v_max_orden + 1,
        v_subtask.completed,
        v_parent_task.id, -- Reference to parent task
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_task_id;
    
    -- Delete the subtask
    DELETE FROM sistema_subtasks WHERE id = p_subtask_id;
    
    -- Add a comment to the new task referencing the parent
    INSERT INTO sistema_comments (
        task_id,
        user_id,
        contenido,
        created_at,
        updated_at
    ) VALUES (
        v_new_task_id,
        COALESCE(p_user_id, v_parent_task.assignee_id),
        'Convertida desde subtarea de: ' || v_parent_task.titulo,
        NOW(),
        NOW()
    );
    
    RETURN v_new_task_id;
END;
$$ language 'plpgsql';
