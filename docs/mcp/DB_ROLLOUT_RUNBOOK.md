# MCP database rollout runbook

This runbook is intentionally staging-first. The migration in this change must
not be applied to the production project from this branch or review session.

## Hard stop: reconcile migration drift first

Before creating a staging database or applying the MCP migration:

1. Export a schema-only snapshot and the migration history from the current
   project.
2. Reconcile local migrations `054` through `077` with the remote migration
   history. Some objects exist remotely without those local versions being
   registered.
3. Resolve the duplicate numeric prefix without rewriting either historical
   file:
   - `055_efemerides_module.sql`
   - `055_fix_subtasks_rls_with_helper_functions.sql`
4. Reconcile timestamped migrations whose local filename differs from the
   remote recorded version.
5. Confirm backup retention and PITR availability. Record the recovery point
   and perform a restore drill in a non-production project.

Do not repair production migration history automatically. Produce an explicit
mapping reviewed by a human before continuing.

Useful read-only checks:

```sql
select version, name, statements
from supabase_migrations.schema_migrations
order by version;
```

```sql
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private')
order by n.nspname, c.relname;
```

## Local validation

The repository currently has no running local Supabase stack and Docker was
unavailable while this migration was authored. The test is runnable but was
not reported as passing without an actual database:

```bash
npx supabase start
npx supabase test db --local supabase/tests/mcp_accounting_control_plane_test.sql
```

If the local reset fails on the historical migration drift, stop. Do not edit
old migrations to make the MCP test pass. Reconcile the history or create a
clean staging baseline first.

Static checks before any apply:

```bash
npx supabase migration list --local
git diff --check
rg -n "SECURITY DEFINER|SET search_path|REVOKE EXECUTE|GRANT EXECUTE" \
  supabase/migrations/20260726131541_create_mcp_accounting_control_plane.sql
```

## Staging-only apply

1. Create or select a dedicated staging Supabase project.
2. Confirm its project reference is not the production reference.
3. Restore the reconciled schema into staging.
4. Apply the MCP migration only to staging through the normal reviewed
   migration pipeline.
5. Keep `private.mcp_config.enabled = false` while configuring OAuth clients,
   grants, hooks and the MCP deployment.
6. Run the pgTAP file against staging with a staging-only database URL.
7. Run Supabase security and performance advisors and resolve every new MCP
   finding.

Never paste a production database password, JWT, client secret or service key
into commands, logs or this repository.

## Register policy and grant

Supabase Auth remains the canonical OAuth client registry. Do not duplicate
redirect URIs or secrets in the MCP tables.

Inspect available clients and candidate administrators:

```sql
select id, client_name, client_uri, registration_type, deleted_at
from auth.oauth_clients
order by created_at desc;
```

```sql
select id, email, nombre, role, is_active, deleted_at
from public.sistema_users
where role = 'admin'
order by email;
```

In a reviewed staging transaction:

```sql
begin;

insert into private.mcp_client_policies(
  client_id,
  required_audience,
  enabled,
  min_aal,
  rate_limit_read_per_minute,
  rate_limit_write_per_minute,
  created_by
)
values (
  '<staging-oauth-client-uuid>'::uuid,
  'https://<staging-mcp-host>/mcp',
  true,
  'aal1',
  60,
  10,
  '<staging-admin-user-uuid>'::uuid
);

insert into private.mcp_client_capabilities(client_id, capability)
values
  ('<staging-oauth-client-uuid>'::uuid, 'accounting.read'),
  ('<staging-oauth-client-uuid>'::uuid, 'accounting.expense.write');

with new_grant as (
  insert into private.mcp_access_grants(
    user_id,
    client_id,
    created_by
  )
  values (
    '<staging-admin-user-uuid>'::uuid,
    '<staging-oauth-client-uuid>'::uuid,
    '<staging-admin-user-uuid>'::uuid
  )
  returning id
)
insert into private.mcp_access_grant_capabilities(grant_id, capability)
select new_grant.id, capability
from new_grant
cross join (
  values ('accounting.read'), ('accounting.expense.write')
) as requested(capability);

commit;
```

Replace placeholders manually and verify the IDs before running. Never
hard-code generated IDs in a committed migration.

## OAuth and authorization matrix

Verify all cases with real staging tokens:

| Case | Expected result |
|---|---|
| Correct `sub`, `client_id`, `session_id`, `aud`, active grant | Allowed |
| Missing/wrong `aud` | `invalid_audience` |
| Disabled or deleted OAuth client | `client_not_allowed` |
| Revoked/expired grant | `missing_capability` |
| Deleted/expired `auth.sessions` row | `invalid_session` |
| Non-admin `sistema_users` actor | `forbidden` |
| OAuth token directly selecting/writing accounting tables | RLS denial |
| OAuth token calling a legacy financial RPC | No rows/RLS denial |
| MCP token issuing approval challenge | `human_approval_required` |
| Direct web AAL1 issuing/using challenge | `aal2_required` |
| Direct web AAL2, same user/session, live nonce | Approval succeeds |
| Commit with extra payload fields | `invalid_request` |
| Commit before approval | `approval_required` |
| Reused/wrong/expired nonce | Denied |
| Tampered normalized payload | `payload_tampered` |
| Disabled account after approval | `account_no_longer_eligible` |

## Legacy financial RPC inventory

The staging catalog currently identifies 17 legacy `SECURITY DEFINER`
financial functions affected by the dynamic invoker fence. Re-run this query
before and after apply; review every result rather than relying on a fixed list:

```sql
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname like 'get_accounting_%'
    or p.proname like 'get_expense_%'
    or p.proname like 'get_future_investment%'
    or p.proname like 'get_partner_contribution%'
    or p.proname like 'get_contribution%'
    or p.proname in (
      'get_account_movements',
      'get_unified_history',
      'get_history_summary'
    )
    or p.prosrc ilike '%accounting_%'
  )
order by p.oid::regprocedure::text;
```

Regression-test every web accounting screen after those functions use invoker
semantics. A first-party web JWT has no `client_id` and should continue through
the existing RLS policies; an OAuth JWT must be fenced out.

## Verify database objects

```sql
select key, value
from private.mcp_config
order by key;
```

```sql
select
  n.nspname,
  c.relname,
  c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'private'
  and c.relname like 'mcp_%'
order by c.relname;
```

```sql
select
  p.oid::regprocedure,
  p.prosecdef,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'mcp_%'
order by p.proname;
```

Confirm that only `authenticated` has execute, every MCP `SECURITY DEFINER`
function has an empty fixed `search_path`, and private tables have no direct
application privileges.

## Enable last

Only after OAuth interoperability, RLS/RPC regression tests, pgTAP, advisors
and service end-to-end tests pass:

```sql
update private.mcp_config
set value = 'true'::jsonb, updated_at = clock_timestamp()
where key = 'enabled';
```

Keep the emergency write switch available:

```sql
update private.mcp_config
set value = 'true'::jsonb, updated_at = clock_timestamp()
where key = 'read_only';
```

## Containment and rollback

The immediate, non-destructive containment sequence is:

```sql
begin;

update private.mcp_config
set value = 'false'::jsonb, updated_at = clock_timestamp()
where key = 'enabled';

update private.mcp_config
set value = 'true'::jsonb, updated_at = clock_timestamp()
where key = 'read_only';

update private.mcp_client_policies
set enabled = false, updated_at = clock_timestamp()
where enabled;

update private.mcp_access_grants
set
  revoked_at = clock_timestamp(),
  revoke_reason = 'Emergency MCP containment'
where revoked_at is null;

update private.mcp_connections
set
  revoked_at = clock_timestamp(),
  revoke_reason = 'Emergency MCP containment'
where revoked_at is null;

commit;
```

Then revoke OAuth consent/sessions in Supabase Auth and verify direct RPCs are
denied. Do not drop private audit/approval tables during incident response.

Reverting the legacy RPC invoker fence or restrictive RLS policies is a
separate reviewed migration after root-cause analysis and a staging regression
run. Do not attempt an ad-hoc production rollback from this change.
