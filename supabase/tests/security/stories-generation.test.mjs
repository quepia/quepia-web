import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const db = new PGlite()
const owner = "00000000-0000-4000-8000-000000000001"
const outsider = "00000000-0000-4000-8000-000000000002"
const project = "00000000-0000-4000-8000-000000000003"
const task = "00000000-0000-4000-8000-000000000004"
const task2 = "00000000-0000-4000-8000-000000000005"
const task3 = "00000000-0000-4000-8000-000000000006"
const batch = "00000000-0000-4000-8000-000000000007"
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users(id uuid primary key);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$select nullif(current_setting('test.user',true),'')::uuid$$;
  CREATE TABLE public.sistema_users(id uuid primary key,is_authorized boolean,is_active boolean,deleted_at timestamptz);
  CREATE TABLE public.sistema_projects(id uuid primary key,owner_id uuid);
  CREATE TABLE public.sistema_project_members(project_id uuid,user_id uuid,role text);
  CREATE TABLE public.sistema_tasks(id uuid primary key,project_id uuid references sistema_projects(id),task_type text,titulo text);
  CREATE TABLE public.sistema_assets(id uuid primary key default gen_random_uuid(),task_id uuid,project_id uuid,nombre text,descripcion text,asset_type text,created_by uuid,approval_status text,current_version int);
  CREATE TABLE public.sistema_asset_versions(id uuid primary key default gen_random_uuid(),asset_id uuid,version_number int,file_url text,storage_path text,file_type text,file_size bigint,thumbnail_url text,thumbnail_path text,preview_path text,original_filename text,uploaded_by uuid,notes text);
  CREATE FUNCTION public.sistema_is_admin(actor uuid) RETURNS boolean LANGUAGE sql AS $$select false$$;
  CREATE FUNCTION public.sistema_can_access_project(project uuid,actor uuid) RETURNS boolean LANGUAGE sql AS $$select exists(select 1 from public.sistema_projects where id=project and owner_id=actor) or exists(select 1 from public.sistema_project_members where project_id=project and user_id=actor)$$;
  GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
  GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT SELECT ON public.sistema_projects,public.sistema_project_members TO authenticated;
  INSERT INTO auth.users VALUES ('${owner}'),('${outsider}');
  INSERT INTO public.sistema_users VALUES ('${owner}',true,true,null),('${outsider}',true,true,null);
  INSERT INTO public.sistema_projects VALUES ('${project}','${owner}');
  INSERT INTO public.sistema_tasks VALUES ('${task}','${project}','story','Historia A'),('${task2}','${project}','story','Historia B'),('${task3}','${project}','story','Historia C');
`)
await db.exec(readFileSync(new URL("../../migrations/20261005150508_stories_ai_generation.sql",import.meta.url),"utf8"))
await db.exec(readFileSync(new URL("../../migrations/20261005161859_fix_story_assets_and_image_bank.sql",import.meta.url),"utf8"))
async function role(role,actor,sql,params=[]) {
  await db.query("select set_config('test.user',$1,false)",[actor||""])
  await db.exec(`set role ${role}`)
  try { return await db.query(sql,params) } finally { await db.exec("reset role") }
}
const job = (id=task,fingerprint="snapshot")=>({task_id:id,fingerprint,settings:{mode:"creative"},brand_context:"Marca",reference_paths:[],logo_path:null,model:"gpt-image-2.5-sunburst",reserved_usd:1})
async function enqueue(actor,jobs,key=batch,budget=5,limit=50,dailyBudget=25) {
  return (await role("service_role",null,"select public.sistema_enqueue_stories($1,$2,$3::jsonb,$4,$5,$6) as jobs",[actor,key,JSON.stringify(jobs),budget,limit,dailyBudget])).rows[0].jobs
}

test("browser roles cannot charge, claim, finalize or forge jobs",async()=>{
  for(const actorRole of ["anon","authenticated"]){
    await assert.rejects(role(actorRole,owner,"select public.sistema_enqueue_stories($1,$2,$3::jsonb,5,50,25)",[owner,batch,JSON.stringify([job()])]),/permission denied/)
    await assert.rejects(role(actorRole,owner,"select public.sistema_claim_story(null)"),/permission denied/)
    await assert.rejects(role(actorRole,owner,"insert into public.sistema_story_generations(task_id) values($1)",[task]),/permission denied/)
  }
})
test("unauthorized actors and insufficient budgets are rejected atomically",async()=>{
  await assert.rejects(enqueue(outsider,[job()]),/no autorizada/)
  await assert.rejects(enqueue(owner,[job(),job(task2)],batch,1),/presupuesto/)
  assert.equal((await db.query("select count(*)::int as n from public.sistema_story_generations")).rows[0].n,0)
})
test("a repeated batch is idempotent and a changed snapshot is rejected",async()=>{
  const first=await enqueue(owner,[job(),job(task2)])
  const repeated=await enqueue(owner,[job(),job(task2)],batch,0)
  assert.equal(first.length,2)
  assert.deepEqual(first.map(j=>j.id).sort(),repeated.map(j=>j.id).sort())
  await assert.rejects(enqueue(owner,[job(task,"changed")]),/otro contenido/)
  await assert.rejects(enqueue(owner,[job(task3)],"00000000-0000-4000-8000-000000000008",5,2),/límite diario/)
})
test("RLS exposes jobs only within an authorized project",async()=>{
  assert.equal((await role("authenticated",owner,"select count(*)::int as n from public.sistema_story_generations")).rows[0].n,2)
  assert.equal((await role("authenticated",outsider,"select count(*)::int as n from public.sistema_story_generations")).rows[0].n,0)
  await assert.rejects(role("anon",null,"select * from public.sistema_story_generations"),/permission denied/)
})
test("claims cap concurrency and stale provider calls are never silently repeated",async()=>{
  await enqueue(owner,[job(task3)],"00000000-0000-4000-8000-000000000009")
  const claim=async()=> (await role("service_role",null,"select public.sistema_claim_story($1) as job",[project])).rows[0].job
  const first=await claim(),second=await claim()
  assert.ok(first.id);assert.ok(second.id);assert.notEqual(first.id,second.id)
  assert.equal(await claim(),null)
  await db.query("update public.sistema_story_generations set started_at=now()-interval '8 minutes' where id=$1",[first.id])
  const third=await claim(); assert.ok(third.id)
  assert.equal((await db.query("select status from public.sistema_story_generations where id=$1",[first.id])).rows[0].status,"needs_attention")
})
test("finalization creates exactly one private asset and one version",async()=>{
  const {rows}=await db.query("select id from public.sistema_story_generations where status='running' limit 1")
  const output=`${project}/${task}/stories/result/final.png`
  const finish=async()=> (await role("service_role",null,"select public.sistema_finish_story($1,$2,$3,500,null,0.15,'request-id') as asset",[rows[0].id,output,output.replace("final.png","base.png")])).rows[0].asset
  const first=await finish();assert.equal(await finish(),first)
  const asset=(await db.query("select * from public.sistema_assets where id=$1",[first])).rows[0]
  assert.equal(asset.approval_status,"pending_review")
  assert.equal((await db.query("select count(*)::int as n from public.sistema_asset_versions where asset_id=$1",[first])).rows[0].n,1)
  assert.equal((await db.query("select file_url from public.sistema_asset_versions where asset_id=$1",[first])).rows[0].file_url,output)
})
test.after(()=>db.close())
