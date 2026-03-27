CREATE OR REPLACE FUNCTION public.enforce_task_column_project_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    column_project_id UUID;
BEGIN
    SELECT project_id
    INTO column_project_id
    FROM public.sistema_columns
    WHERE id = NEW.column_id;

    IF column_project_id IS NULL THEN
        RAISE EXCEPTION 'Column % does not exist.', NEW.column_id;
    END IF;

    IF NEW.project_id IS DISTINCT FROM column_project_id THEN
        RAISE EXCEPTION
            'Task project_id % does not match column project_id %.',
            NEW.project_id,
            column_project_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_column_project_match ON public.sistema_tasks;

CREATE TRIGGER trg_enforce_task_column_project_match
BEFORE INSERT OR UPDATE OF project_id, column_id
ON public.sistema_tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_column_project_match();
