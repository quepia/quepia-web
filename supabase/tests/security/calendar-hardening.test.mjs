import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const db = new PGlite()
const owner = "00000000-0000-4000-8000-000000000001"
const member = "00000000-0000-4000-8000-000000000002"
const outsider = "00000000-0000-4000-8000-000000000003"
const project = "00000000-0000-4000-8000-000000000004"
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE mcp_authenticated;
  CREATE SCHEMA auth; CREATE SCHEMA private;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS
    $$SELECT COALESCE(NULLIF(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
  CREATE TABLE public.sistema_users(id uuid PRIMARY KEY, is_authorized boolean);
  CREATE FUNCTION private.sistema_user_is_authorized(actor uuid) RETURNS boolean LANGUAGE sql AS
    $$SELECT COALESCE((SELECT is_authorized FROM public.sistema_users WHERE id=actor),false)$$;
  CREATE TABLE public.sistema_projects(id uuid PRIMARY KEY, owner_id uuid);
  CREATE TABLE public.sistema_project_members(project_id uuid,user_id uuid,role text);
  CREATE TABLE public.sistema_calendar_events(project_id uuid,titulo text,descripcion text,tipo text,
    fecha_inicio timestamptz,todo_el_dia boolean,color text,created_by uuid);
  INSERT INTO public.sistema_users VALUES ('${owner}',true),('${member}',true),('${outsider}',false);
  INSERT INTO public.sistema_projects VALUES ('${project}','${owner}');
  INSERT INTO public.sistema_project_members VALUES ('${project}','${member}','member');
  GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,mcp_authenticated;
`)
await db.exec(readFileSync(new URL("../../migrations/20260930133154_cybersecurity_hardening.sql", import.meta.url), "utf8"))

async function call(role, actor, supplied = actor, extras = {}, events = [{ titulo: "Seguro", fecha_inicio: "2026-10-01T15:00:00Z" }]) {
  await db.query("SELECT set_config('request.jwt.claims',$1,false)", [JSON.stringify({role,sub:actor,...extras})])
  await db.exec(`SET ROLE ${role}`)
  try {
    return await db.query("SELECT public.bulk_insert_calendar_events($1::jsonb,$2::uuid,$3::uuid) AS count", [JSON.stringify(events), project, supplied])
  } finally {
    await db.exec("RESET ROLE")
  }
}

test("anonymous and OAuth roles cannot execute the import", async () => {
  await assert.rejects(call("anon", null, owner), /permission denied/)
  await assert.rejects(call("mcp_authenticated", owner), /permission denied/)
})
test("first-party callers cannot impersonate another user", async () => {
  await assert.rejects(call("authenticated", member, owner), /Not authorized/)
  await assert.rejects(call("authenticated", null, owner), /Not authorized/)
  await assert.rejects(call("authenticated", owner, owner, {client_id:"oauth"}), /Not authorized/)
})
test("unauthorized users and users outside the project cannot import", async () => {
  await assert.rejects(call("authenticated", outsider), /Not authorized/)
  await db.query("UPDATE public.sistema_users SET is_authorized=true WHERE id=$1",[outsider])
  await assert.rejects(call("authenticated", outsider), /Project access denied/)
})
test("authorized owner and member still import with their actual identity", async () => {
  assert.equal((await call("authenticated", owner)).rows[0].count,1)
  assert.equal((await call("authenticated", member)).rows[0].count,1)
  const {rows}=await db.query("SELECT created_by FROM public.sistema_calendar_events")
  assert.deepEqual(rows.map(r=>r.created_by),[owner,member])
})
test("invalid and oversized input fails before writing", async () => {
  await assert.rejects(call("authenticated",owner,owner,{},{}),/Events must be an array/)
  await assert.rejects(call("authenticated",owner,owner,{},Array(1001).fill({})),/too large/)
  await assert.rejects(call("authenticated",owner,owner,{},[{titulo:'x'.repeat(1000001)}]),/too large/)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.sistema_calendar_events")).rows[0].count,2)
})

test.after(async () => db.close())
