-- Match the actual asset version schema; preserve existing grants and idempotency.
create or replace function public.sistema_finish_story(p_job uuid,p_output text,p_base text,p_size bigint,p_usage jsonb,p_cost numeric,p_request text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare job public.sistema_story_generations; asset uuid;
begin
  select * into job from public.sistema_story_generations where id=p_job for update;
  if job.status='succeeded' then return job.asset_id; end if;
  if job.status not in ('running','needs_attention') then raise exception 'Estado de generación inválido'; end if;
  insert into public.sistema_assets(task_id,project_id,nombre,descripcion,asset_type,created_by,approval_status,current_version)
    select job.task_id,job.project_id,titulo || ' · Historia', 'Generada desde Quepia', 'single',job.created_by,'pending_review',1
    from public.sistema_tasks where id=job.task_id returning id into asset;
  insert into public.sistema_asset_versions(asset_id,version_number,file_url,storage_path,file_type,file_size,thumbnail_url,thumbnail_path,preview_path,original_filename,uploaded_by,notes)
    values(asset,1,p_output,p_output,'image/png',p_size,replace(p_output,'final.png','thumb.webp'),replace(p_output,'final.png','thumb.webp'),
      replace(p_output,'final.png','preview.webp'),'historia.png',job.created_by,'Historia · ' || job.model);
  update public.sistema_story_generations set status='succeeded',asset_id=asset,output_path=p_output,base_path=p_base,
    usage=p_usage,cost_usd=p_cost,provider_request_id=p_request,finished_at=now(),error_message=null where id=job.id;
  return asset;
end $$;
