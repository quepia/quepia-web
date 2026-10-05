-- One task per story; image jobs are immutable snapshots, written by the server.
alter table public.sistema_tasks drop constraint if exists sistema_tasks_task_type_check;
alter table public.sistema_tasks add constraint sistema_tasks_task_type_check
  check (task_type = any (array['diseno','copy','video','reel','story','strategy','revision','otro']));

create table public.sistema_story_generations (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.sistema_tasks(id) on delete cascade,
  project_id uuid not null references public.sistema_projects(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  batch_key uuid not null,
  fingerprint text not null,
  settings jsonb not null,
  brand_context text not null default '',
  reference_paths text[] not null default '{}',
  logo_path text,
  model text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','needs_attention','cancelled')),
  reserved_usd numeric(12,6) not null check (reserved_usd >= 0),
  cost_usd numeric(12,6),
  usage jsonb,
  provider_request_id text,
  asset_id uuid references public.sistema_assets(id) on delete set null,
  base_path text,
  output_path text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (created_by, batch_key, task_id)
);
create index story_generations_project_created on public.sistema_story_generations(project_id, created_at desc);
create index story_generations_task_created on public.sistema_story_generations(task_id, created_at desc);
create index story_generations_actor_created on public.sistema_story_generations(created_by, created_at desc);
create index story_generations_queue on public.sistema_story_generations(created_at) where status = 'queued';
alter table public.sistema_story_generations enable row level security;
revoke all on public.sistema_story_generations from anon, authenticated;
grant select on public.sistema_story_generations to authenticated;
grant all on public.sistema_story_generations to service_role;
create policy "Project members read story generations" on public.sistema_story_generations
  for select to authenticated using (public.sistema_can_access_project(project_id, (select auth.uid())));

-- The service role is the only caller. Permission and budget checks are repeated
-- here so concurrent requests cannot bypass limits enforced by the HTTP layer.
create function public.sistema_enqueue_stories(
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

create function public.sistema_claim_story(p_project uuid default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare job public.sistema_story_generations;
begin
  perform pg_advisory_xact_lock(hashtext('quepia-story-claim'));
  -- Never repeat an interrupted provider call automatically: it may be billed.
  update public.sistema_story_generations set status='needs_attention',error_message='La generación se interrumpió. Revisá el resultado antes de volver a generar.'
    where status='running' and started_at < now()-interval '7 minutes';
  if (select count(*) from public.sistema_story_generations where status='running') >= 2 then return null; end if;
  select g.* into job from public.sistema_story_generations g
    where g.status='queued' and (p_project is null or g.project_id=p_project)
      and public.sistema_can_access_project(g.project_id,g.created_by)
      and (public.sistema_is_admin(g.created_by)
        or exists(select 1 from public.sistema_projects p where p.id=g.project_id and p.owner_id=g.created_by)
        or exists(select 1 from public.sistema_project_members m where m.project_id=g.project_id and m.user_id=g.created_by and m.role in ('owner','admin','member')))
      and exists(select 1 from public.sistema_users u where u.id=g.created_by and u.is_authorized and coalesce(u.is_active,true) and u.deleted_at is null)
    order by g.created_at for update skip locked limit 1;
  if job.id is null then return null; end if;
  update public.sistema_story_generations set status='running',started_at=now() where id=job.id returning * into job;
  return to_jsonb(job);
end $$;

-- Asset + version + job are committed together. All paths are private storage paths.
create function public.sistema_finish_story(p_job uuid,p_output text,p_base text,p_size bigint,p_usage jsonb,p_cost numeric,p_request text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare job public.sistema_story_generations; asset uuid;
begin
  select * into job from public.sistema_story_generations where id=p_job for update;
  if job.status='succeeded' then return job.asset_id; end if;
  if job.status not in ('running','needs_attention') then raise exception 'Estado de generación inválido'; end if;
  insert into public.sistema_assets(task_id,project_id,nombre,descripcion,asset_type,created_by,approval_status,current_version)
    select job.task_id,job.project_id,titulo || ' · Historia', 'Generada desde Quepia', 'single',job.created_by,'pending_review',1
    from public.sistema_tasks where id=job.task_id returning id into asset;
  insert into public.sistema_asset_versions(asset_id,version_number,file_url,storage_path,file_type,file_size,thumbnail_url,thumbnail_path,preview_url,preview_path,original_filename,uploaded_by,notes)
    values(asset,1,p_output,p_output,'image/png',p_size,replace(p_output,'final.png','thumb.webp'),replace(p_output,'final.png','thumb.webp'),
      replace(p_output,'final.png','preview.webp'),replace(p_output,'final.png','preview.webp'),'historia.png',job.created_by,'Historia · ' || job.model);
  update public.sistema_story_generations set status='succeeded',asset_id=asset,output_path=p_output,base_path=p_base,
    usage=p_usage,cost_usd=p_cost,provider_request_id=p_request,finished_at=now(),error_message=null where id=job.id;
  return asset;
end $$;
revoke all on function public.sistema_enqueue_stories(uuid,uuid,jsonb,numeric,integer,numeric),public.sistema_claim_story(uuid),
  public.sistema_finish_story(uuid,text,text,bigint,jsonb,numeric,text) from public,anon,authenticated;
grant execute on function public.sistema_enqueue_stories(uuid,uuid,jsonb,numeric,integer,numeric),public.sistema_claim_story(uuid),
  public.sistema_finish_story(uuid,text,text,bigint,jsonb,numeric,text) to service_role;
