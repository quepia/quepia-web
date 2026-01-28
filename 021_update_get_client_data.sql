-- Update get_client_project_data to include comments
create or replace function get_client_project_data(token text)
returns json
language plpgsql
security definer
as $$
declare
    access_record record;
    project_record record;
    client_record record;
    events_json json;
    tasks_json json;
begin
    -- 1. Get access record
    select * into access_record
    from sistema_client_access
    where id::text = token;

    if access_record is null then
        return json_build_object('error', 'Invalid token');
    end if;

    -- 2. Get project info
    select id, nombre, color, owner_id into project_record
    from sistema_projects
    where id = access_record.project_id;

    if project_record is null then
        return json_build_object('error', 'Project not found');
    end if;

    -- 3. Get events (with comments) if allowed
    if access_record.can_view_calendar then
        select json_agg(
            json_build_object(
                'id', e.id,
                'titulo', e.titulo,
                'descripcion', e.descripcion,
                'tipo', e.tipo,
                'fecha_inicio', e.fecha_inicio,
                'fecha_fin', e.fecha_fin,
                'todo_el_dia', e.todo_el_dia,
                'color', e.color,
                'comments', (
                    select json_agg(
                        json_build_object(
                            'id', c.id,
                            'content', c.content,
                            'created_at', c.created_at,
                            'author_name', c.author_name,
                            'is_client', c.is_client
                        ) order by c.created_at asc
                    )
                    from sistema_calendar_comments c
                    where c.event_id = e.id
                )
            )
        ) into events_json
        from sistema_calendar_events e
        where e.project_id = access_record.project_id;
    end if;

    -- 4. Get tasks if allowed
    if access_record.can_view_tasks then
        select json_agg(
            json_build_object(
                'id', t.id,
                'titulo', t.titulo,
                'descripcion', t.descripcion,
                'column', c.nombre,
                'priority', t.priority,
                'due_date', t.due_date,
                'completed', t.completed
            )
        ) into tasks_json
        from sistema_tasks t
        left join sistema_columns c on c.id = t.column_id
        where t.project_id = access_record.project_id;
    end if;

    return json_build_object(
        'project', project_record,
        'client', json_build_object(
            'id', access_record.id,
            'nombre', access_record.client_name,
            'can_view_calendar', access_record.can_view_calendar,
            'can_view_tasks', access_record.can_view_tasks,
            'can_comment', access_record.can_comment
        ),
        'calendar_events', coalesce(events_json, '[]'::json),
        'tasks', coalesce(tasks_json, '[]'::json)
    );
end;
$$;
