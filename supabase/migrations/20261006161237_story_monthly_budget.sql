-- Budget admission is serialized by the existing transaction advisory lock.
-- Unknown provider costs retain their reservation; never treat them as free.
create or replace function public.sistema_enqueue_stories(
  p_actor uuid, p_batch uuid, p_jobs jsonb, p_budget numeric, p_daily_limit integer, p_daily_budget numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; task public.sistema_tasks; existing public.sistema_story_generations;
  total numeric := 0; count_new integer := 0; daily_count integer; daily_cost numeric;
  result jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('quepia-story-enqueue'));
  if not exists (select 1 from public.sistema_users where id = p_actor and is_authorized
      and coalesce(is_active,true) and deleted_at is null) then raise exception 'Acceso no autorizado'; end if;
  if jsonb_array_length(p_jobs) not between 1 and 20 or p_budget < 0 then raise exception 'Lote inválido'; end if;
  for item in select value from jsonb_array_elements(p_jobs) loop
    select * into task from public.sistema_tasks where id = (item->>'task_id')::uuid;
    if task.id is null or task.task_type <> 'story' or not public.sistema_can_access_project(task.project_id,p_actor)
      or not (public.sistema_is_admin(p_actor) or exists(select 1 from public.sistema_projects where id=task.project_id and owner_id=p_actor)
        or exists(select 1 from public.sistema_project_members where project_id=task.project_id and user_id=p_actor and role in ('owner','admin','member')))
      then raise exception 'Historia no autorizada'; end if;
    select * into existing from public.sistema_story_generations where created_by=p_actor and batch_key=p_batch and task_id=task.id;
    if existing.id is not null then
      if existing.fingerprint <> item->>'fingerprint' then raise exception 'El lote ya existe con otro contenido'; end if;
      continue;
    end if;
    if (item->>'reserved_usd')::numeric < 0 then raise exception 'Reserva inválida'; end if;
    total := total + (item->>'reserved_usd')::numeric;
    count_new := count_new + 1;
  end loop;
  if total > p_budget then raise exception 'El presupuesto del lote no alcanza'; end if;
  select count(*), coalesce(sum(coalesce(cost_usd,reserved_usd)),0) into daily_count,daily_cost
    from public.sistema_story_generations where created_by=p_actor
      and created_at >= date_trunc('day',now() at time zone 'America/Argentina/Cordoba') at time zone 'America/Argentina/Cordoba'
      and status <> 'cancelled';
  if daily_count + count_new > p_daily_limit or daily_cost + total > p_daily_budget then
    raise exception 'Se alcanzó el límite diario de generación'; end if;
  -- Global budget: all clients and actors share the same image API account.
  if total > 0 and (select coalesce(sum(coalesce(cost_usd,reserved_usd)),0)
    from public.sistema_story_generations
    where created_at >= date_trunc('month',now() at time zone 'America/Argentina/Cordoba') at time zone 'America/Argentina/Cordoba'
      and (status <> 'cancelled' or cost_usd > 0)) + total > 5 then
    raise exception 'Se alcanzó el presupuesto mensual de USD 5 para imágenes (incluye reservas de intentos sin costo confirmado)';
  end if;
  for item in select value from jsonb_array_elements(p_jobs) loop
    insert into public.sistema_story_generations(task_id,project_id,created_by,batch_key,fingerprint,settings,brand_context,reference_paths,logo_path,model,reserved_usd)
      select id,project_id,p_actor,p_batch,item->>'fingerprint',item->'settings',item->>'brand_context',
        array(select jsonb_array_elements_text(item->'reference_paths')),item->>'logo_path',item->>'model',(item->>'reserved_usd')::numeric
      from public.sistema_tasks where id=(item->>'task_id')::uuid
      on conflict (created_by,batch_key,task_id) do nothing;
  end loop;
  select jsonb_agg(to_jsonb(g)) into result from public.sistema_story_generations g
    where created_by=p_actor and batch_key=p_batch;
  return result;
end $$;


REVOKE ALL ON FUNCTION public.sistema_enqueue_stories(uuid,uuid,jsonb,numeric,integer,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_enqueue_stories(uuid,uuid,jsonb,numeric,integer,numeric) TO service_role;

-- Only future task settings change; historical paid job snapshots stay intact.
UPDATE public.sistema_tasks
SET type_metadata = jsonb_set(type_metadata, '{story,quality}', '"low"'::jsonb)
WHERE jsonb_typeof(type_metadata->'story') = 'object';

CREATE OR REPLACE FUNCTION public.sistema_story_monthly_usage()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('limit',5,'spent',coalesce(sum(cost_usd),0),
    'reserved',coalesce(sum(CASE WHEN cost_usd IS NULL THEN reserved_usd ELSE 0 END),0),
    'remaining',greatest(0,5-coalesce(sum(coalesce(cost_usd,reserved_usd)),0)))
  FROM public.sistema_story_generations
  WHERE created_at >= date_trunc('month',now() at time zone 'America/Argentina/Cordoba') at time zone 'America/Argentina/Cordoba'
    AND (status <> 'cancelled' OR cost_usd > 0);
$$;
REVOKE ALL ON FUNCTION public.sistema_story_monthly_usage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sistema_story_monthly_usage() TO service_role;
