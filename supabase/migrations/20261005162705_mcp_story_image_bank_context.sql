-- Extend the existing authorized context without changing its access checks or RPC allowlist.
do $migration$
declare definition text; needle text := '''brief'', brief_payload,'; addition text := $addition$
'brief', brief_payload,
      'image_bank', coalesce((select jsonb_agg(to_jsonb(photo)) from (
        select a.id as asset_id, a.nombre as name, a.task_id, v.drive_file_id,
          v.file_type, v.notes, v.ai_content_analysis
        from public.sistema_assets a
        join public.sistema_asset_versions v on v.asset_id=a.id and v.version_number=a.current_version
        where a.project_id=project_id_value and not coalesce(a.access_revoked,false)
          and v.file_type like 'image/%'
        order by a.created_at desc limit 100
      ) photo),'[]'::jsonb),
      'story_description_format', 'Objetivo: ... / Visual: ... / Texto exacto: ... / CTA: ... / Restricciones: ... / Referencias: asset UUIDs or Drive file IDs. Use one field per line. Without explicit references the generator selects pertinent photos from the linked image bank. Never invent photo IDs or commercial facts.',
$addition$;
begin
  select pg_get_functiondef('public.mcp_intelligence_get_project_context(jsonb)'::regprocedure) into definition;
  if position('''image_bank''' in definition)>0 then return; end if;
  if position(needle in definition)=0 then raise exception 'Cannot extend project context: expected brief field missing'; end if;
  execute replace(definition,needle,addition);
end $migration$;
