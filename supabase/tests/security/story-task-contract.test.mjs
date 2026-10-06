import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const project='33333333-3333-4333-8333-333333333333', column='77777777-7777-4777-8777-777777777777',operation='66666666-6666-4666-8666-666666666666'
const db=new PGlite()
await db.exec(`
CREATE SCHEMA private;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE public.sistema_columns(id uuid, project_id uuid, orden integer, created_at timestamptz);
CREATE TABLE public.sistema_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid,column_id uuid,titulo text,descripcion text,priority text,deadline timestamptz,labels text[],assignee_id uuid,estimated_hours numeric,social_copy text,orden integer,completed boolean,completed_at timestamptz,updated_at timestamptz DEFAULT now(),created_at timestamptz DEFAULT now(),parent_task_id uuid,type_metadata jsonb DEFAULT '{}');
CREATE TABLE private.mcp_operation_undo(operation_id uuid,ordinal integer,undo_action text,entity_table text,entity_id uuid,snapshot jsonb);
CREATE FUNCTION private.mcp_ok(value jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('ok',true,'data',value) $$;
CREATE FUNCTION private.mcp_error(code text,message text,details jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('ok',false,'error',jsonb_build_object('code',code,'message',message,'details',details)) $$;
CREATE FUNCTION private.mcp_json_has_only_keys(value jsonb,keys text[]) RETURNS boolean LANGUAGE sql AS $$ SELECT NOT EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT k=ANY(keys)) $$;
CREATE FUNCTION private.mcp_parse_uuid(value text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RETURN value::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;
CREATE FUNCTION private.mcp_tasks_text_value(value jsonb,field text,min_length integer,max_length integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.mcp_ok(jsonb_build_object('value',value->>field)) $$;
CREATE FUNCTION private.mcp_optional_text(value jsonb,field text,max_length integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.mcp_ok(jsonb_build_object('value',value->>field)) $$;
CREATE FUNCTION private.mcp_tasks_resolve_reference(kind text,value jsonb,id_field text,query_field text,project_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.mcp_ok(jsonb_build_object('id',value->>id_field)) $$;
CREATE FUNCTION private.mcp_authorize(capability text,tool text,mode text) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.mcp_ok('{}') $$;
CREATE FUNCTION private.mcp_config_integer(key text,fallback integer) RETURNS integer LANGUAGE sql AS $$ SELECT fallback $$;
CREATE FUNCTION private.mcp_tasks_risk(count integer) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION private.mcp_direct_operation_open(context jsonb,kind text,capability text,key text,payload jsonb,risk jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT private.mcp_ok(jsonb_build_object('operation_id','${operation}','idempotent_replay',false)) $$;
CREATE FUNCTION private.mcp_tasks_record_undo(operation uuid,ordinal integer,action text,entity text,id uuid,snapshot jsonb DEFAULT NULL) RETURNS void LANGUAGE sql AS $$ INSERT INTO private.mcp_operation_undo VALUES(operation,ordinal,action,entity,id,snapshot) $$;
CREATE FUNCTION private.mcp_direct_operation_commit(operation uuid,entity text,id uuid,value jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION private.mcp_audit_event(event text,tool text,outcome text,user_id uuid,client_id uuid,session_id uuid,operation uuid,capability text,data jsonb) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE FUNCTION private.mcp_direct_operation_view(operation uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
INSERT INTO public.sistema_columns VALUES('${column}','${project}',0,now());
`)
// The migration retains these existing RPC dependencies unchanged.
const original=readFileSync(new URL('../../migrations/20260727212000_mcp_tasks_write_rpcs.sql',import.meta.url),'utf8')
for (const name of ['private.mcp_tasks_resolve_target', 'public.mcp_tasks_create_tasks_batch']) {
 const start=original.indexOf('CREATE OR REPLACE FUNCTION '+name+'(')
 const tag=original.slice(start).match(/AS (\$\w+\$)/)[1]
 const end=original.indexOf(tag+';',original.indexOf('AS '+tag,start)+tag.length+3)+tag.length+1
 await db.exec(original.slice(start,end))
}
const migrationName=readdirSync(new URL('../../migrations/',import.meta.url)).find(n=>n.endsWith('_mcp_story_task_contract.sql'))
await db.exec(readFileSync(new URL('../../migrations/'+migrationName,import.meta.url),'utf8'))
async function rpc(name,value){return (await db.query(`SELECT ${name}($1::jsonb) AS result`,[JSON.stringify(value)])).rows[0].result}
test('database story validation rejects unknown fields, nulls, excessive copy and invented IDs',async()=>{
 for(const value of [{},{headline:null},{headline:'a'.repeat(121)},{role:'admin'},{referenceAssetIds:['invented']},{referenceDriveFileIds:['short']}]) assert.equal((await rpc('private.mcp_tasks_story_value',value)).ok,false)
 assert.equal((await rpc('private.mcp_tasks_story_value',{headline:'Reservá',cta:'',referenceAssetIds:[],includeLogo:true})).ok,true)
})
test('MCP create, story patch, task reads and undo retain copy and unrelated metadata',async()=>{
 const create=await rpc('public.mcp_tasks_create_task',{idempotency_key:crypto.randomUUID(),project_id:project,column_id:column,title:'Nombre interno',description:'Dirección creativa',story:{headline:'Texto exacto',cta:'Consultanos',supportingText:'Junto al río'}})
 assert.equal(create.ok,true,JSON.stringify(create))
 const task=(await db.query('SELECT * FROM public.sistema_tasks')).rows[0]
 assert.equal(task.type_metadata.story.headline,'Texto exacto')
 // Keep the actual creation test above; discard its undo entry before testing patch undo.
 await db.exec(`DELETE FROM private.mcp_operation_undo; UPDATE public.sistema_tasks SET type_metadata=type_metadata || '{"other":{"keep":true}}'::jsonb;`)
 const updated=await rpc('public.mcp_tasks_update_task',{idempotency_key:crypto.randomUUID(),task_id:task.id,story:{cta:'Escribinos',headline:''}})
 assert.equal(updated.ok,true,JSON.stringify(updated))
 const metadata=(await db.query('SELECT type_metadata FROM public.sistema_tasks')).rows[0].type_metadata
 assert.equal(metadata.story.cta,'Escribinos');assert.equal(metadata.story.headline,'');assert.equal(metadata.story.supportingText,'Junto al río');assert.equal(metadata.story.prompt,'');assert.deepEqual(metadata.other,{keep:true})
 const summary=(await db.query('SELECT private.mcp_tasks_summary($1::uuid) AS result',[task.id])).rows[0].result
 assert.equal(summary.story.cta,'Escribinos')
 const undo=(await db.query('SELECT private.mcp_tasks_undo_operation($1::uuid, now()) AS result',[operation])).rows[0].result
 assert.equal(undo.ok,true,JSON.stringify(undo))
 const restored=(await db.query('SELECT type_metadata FROM public.sistema_tasks')).rows[0].type_metadata
 assert.equal(restored.story.cta,'Consultanos');assert.equal(restored.story.headline,'Texto exacto');assert.deepEqual(restored.other,{keep:true})
})
test('batch validates all story copy before creating any card',async()=>{
 const before=Number((await db.query('SELECT count(*) AS count FROM public.sistema_tasks')).rows[0].count)
 const base={idempotency_key:crypto.randomUUID(),project_id:project,column_id:column}
 const invalid=await rpc('public.mcp_tasks_create_tasks_batch',{...base,tasks:[{title:'First',story:{headline:'Primera'}},{title:'Second',story:{cta:'x'.repeat(71)}}]})
 assert.equal(invalid.ok,false)
 assert.equal(Number((await db.query('SELECT count(*) AS count FROM public.sistema_tasks')).rows[0].count),before)
 const valid=await rpc('public.mcp_tasks_create_tasks_batch',{...base,tasks:[{title:'First',story:{headline:'Primera',cta:'Consultanos'}},{title:'Second',story:{headline:'Segunda',cta:'Reservá'}}]})
 assert.equal(valid.ok,true,JSON.stringify(valid))
 const rows=(await db.query("SELECT type_metadata FROM public.sistema_tasks WHERE titulo IN ('First','Second') ORDER BY titulo")).rows
 assert.deepEqual(rows.map(row=>row.type_metadata.story.headline),['Primera','Segunda'])
})
test.after(async()=>{await db.close()})
