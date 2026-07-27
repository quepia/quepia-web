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
npm run mcp:sql:verify
git diff --check
rg -n "SECURITY DEFINER|SET search_path|REVOKE EXECUTE|GRANT EXECUTE" \
  supabase/migrations/20260726131541_create_mcp_accounting_control_plane.sql \
  supabase/migrations/20260726145759_mcp_oauth_onboarding.sql \
  supabase/migrations/20260726170443_mcp_hook_clock_timestamp.sql
```

`mcp:sql:verify` pins the reviewed SHA-256 of every MCP migration already
recorded in production. The production preflight performed on 2026-07-26
confirmed that the base and onboarding migrations had not yet been applied,
which allowed their final compatibility corrections before first apply. Once
an environment records a migration, never edit it again: move every subsequent
change to a new forward migration.

Reviewed migration hashes:

- `20260726131541_create_mcp_accounting_control_plane.sql`:
  `74f8ffe76290756427283b6d59b57a95fc24b42215e25cedb6de4d515cc59309`
- `20260726145759_mcp_oauth_onboarding.sql`:
  `79dad9b6380421f0e431c5c2099654b5a7486ea3e8481a1b3456be2958a5e0c5`
- `20260726170443_mcp_hook_clock_timestamp.sql`:
  `d96ecddbafadd521013fd46635dd7131b6a02950bad24ddecfb8da291a352b58`

Before applying the forward-only hook fix, verify its hash exactly. After it is
recorded remotely, add that hash to the verifier's immutable-applied map without
editing the migration.

## Staging-only apply

1. Create or select a dedicated staging Supabase project.
2. Confirm its project reference is not the production reference.
3. Restore the reconciled schema into staging.
4. Apply the MCP migrations, in order, only to staging through the normal
   reviewed migration pipeline:
   - `20260726131541_create_mcp_accounting_control_plane.sql`
   - `20260726145759_mcp_oauth_onboarding.sql`
   - `20260726170443_mcp_hook_clock_timestamp.sql`
5. Keep `private.mcp_config.enabled = false` while configuring the
   per-environment resource URI, OAuth clients, grants, hooks and the MCP
   deployment.
6. Run the pgTAP file against staging with a staging-only database URL.
7. Run Supabase security and performance advisors and resolve every new MCP
   finding.

Never paste a production database password, JWT, client secret or service key
into commands, logs or this repository.

## Audit administrators before activation

The MCP authorization helpers accept only a persisted `sistema_users` profile
with `role = 'admin'`, `is_active = true`, and `deleted_at IS NULL`. Before
enabling OAuth, inventory every current or historical admin:

```sql
select id, email, nombre, role, is_active, deleted_at, deleted_by
from public.sistema_users
where role = 'admin'
order by deleted_at nulls first, email;
```

Have a human owner verify every row. Remove or deactivate unauthorized accounts
in a reviewed database-owner transaction before activation. An active admin
reuses their existing direct web login to connect, list, or revoke MCP clients;
MFA enrollment is not a connection prerequisite. The onboarding migration also blocks
self-promotion and self-reactivation through Data API RLS: non-admin users may
create only their own active profile with the default `user` role and may not
change `role`, `is_active`, `deleted_at`, or `deleted_by`. OAuth/MCP JWTs cannot
change those fields even when their subject is an existing admin.

## Configure the protected resource per environment

The onboarding migration deliberately initializes
`private.mcp_config.resource_uri` to JSON `null`. There is no public setter.
Configure it in a private database-owner deployment transaction before enabling
the OAuth server, DCR, the Auth hook, or the MCP service:

```sql
begin;

update private.mcp_config
set
  value = to_jsonb(
    'https://staging-mcp.your-controlled-domain.example/mcp'::text
  ),
  updated_at = clock_timestamp()
where key = 'resource_uri';

do $verify_mcp_resource_uri$
begin
  if private.mcp_resource_uri() is distinct from
    'https://staging-mcp.your-controlled-domain.example/mcp'
  then
    raise exception 'invalid staging MCP resource_uri';
  end if;
end
$verify_mcp_resource_uri$;

commit;
```

Replace the reserved example hostname with the stable staging MCP origin before
execution. Set the MCP service's `MCP_RESOURCE_URI` to that exact same value.
For production, perform a separate reviewed transaction with the verified
production URI; the migration never assumes or rejects a particular
environment. A missing or malformed configured URI fails closed for an active
grant.

## OAuth server, hook and client onboarding

Supabase Auth remains the canonical OAuth client registry. Do not duplicate
redirect URIs or secrets in the MCP tables.

Before onboarding a client:

1. Confirm the private resource URI and service `MCP_RESOURCE_URI` match.
2. Confirm the active-administrator inventory above is complete.
3. Enable the Supabase OAuth 2.1 server and Dynamic Client Registration (DCR)
   in the staging project.
4. Configure the authorization/consent endpoint.
5. Confirm the administrator has an active direct first-party browser login;
   AAL1 is sufficient for connect/list/revoke.
6. Exercise DCR with the intended MCP client and validate its registered
   redirect URI and metadata during the consent flow.
7. Do not ask an administrator to pre-register a client, copy a client ID, or
   handle a client secret. If a host cannot complete DCR, treat that host as
   unsupported until its interoperability issue is resolved.
8. In Authentication > Hooks, select
   `public.mcp_custom_access_token_hook` as the Custom Access Token hook.
9. Confirm the access-token hook and PostgREST pre-request behavior with real
   staging HTTP requests as described below.

Registration is not authorization. DCR only creates the canonical client record
in `auth.oauth_clients`; it does not create an MCP policy, attach capabilities,
grant a user access or enable a token audience.

Supabase selects a single Custom Access Token hook. If the project already has
one configured, stop and merge both behaviors into one reviewed hook; do not
replace an existing hook silently.

The hook preserves direct first-party tokens, which have no `client_id`. Every
token with a non-empty OAuth `client_id` receives database role
`mcp_authenticated`, including unprovisioned and malformed client IDs. It sets
the protected-resource `aud` only when `event.user_id` equals `claims.sub`, the
client UUID is active and enabled, and an unrevoked user/client database grant
exists. The hook never fabricates or upgrades `aal`. Its database `EXECUTE`
privilege must be limited to `supabase_auth_admin`.

The `mcp_authenticated` role is `NOLOGIN`, `NOINHERIT`, has no application table,
private-schema, Storage, or Realtime grants, and can execute only the machine MCP
facade. Human lifecycle and approval RPCs stay on `authenticated`. PostgREST is
configured with `public.mcp_postgrest_pre_request`, which permits OAuth requests
only when:

- the signed JWT role is exactly `mcp_authenticated`;
- `request.method` is `POST`; and
- `request.path` is one of the exact machine RPC paths such as
  `rpc/mcp_get_context`. PostgREST 11 and later report `request.path` with a
  leading slash, so the gate strips it before matching and accepts either
  spelling; the allowlist still matches the RPC name exactly.

If `authenticator` already has a different `pgrst.db_pre_request`, the migration
fails instead of overwriting it. Compose both behaviors in one reviewed
pre-request function before retrying.

This is a hard staging gate. pgTAP simulates `request.path` and
`request.method`, but production is not ready until real staging HTTP proves:

- an allowed machine RPC succeeds with a provisioned OAuth token;
- `GET`/`POST` to `sistema_users` and accounting tables is denied;
- GraphQL, Storage, and Realtime access is denied;
- `rpc/mcp_accounting_approve_expense` and lifecycle RPCs are denied; and
- a direct first-party `authenticated` browser request still works.

Inspect the observed PostgREST path in staging logs if a permitted RPC is
rejected. Do not broaden the allowlist or add a wildcard. Because PostgreSQL
roles can inherit function execution from `PUBLIC`, the exact global
pre-request gate is part of the isolation boundary, not an optional hardening.

Verify hook privileges without exposing client metadata:

```sql
select
  has_function_privilege(
    'supabase_auth_admin',
    'public.mcp_custom_access_token_hook(jsonb)',
    'execute'
  ) as auth_hook_execute,
  has_function_privilege(
    'authenticated',
    'public.mcp_custom_access_token_hook(jsonb)',
    'execute'
  ) as authenticated_execute,
  has_function_privilege(
    'anon',
    'public.mcp_custom_access_token_hook(jsonb)',
    'execute'
  ) as anon_execute,
  has_function_privilege(
    'service_role',
    'public.mcp_custom_access_token_hook(jsonb)',
    'execute'
  ) as service_role_execute;
```

Expected: `auth_hook_execute = true` and every application-role result is
`false`.

During consent, the first-party web flow must obtain the authorization details
from Supabase Auth, validate that the authorization belongs to the current
user, and use the verified `client_id` from those details. Immediately before
approving the authorization, the existing direct login of the active admin
provisions that verified client ID:

```json
{
  "client_id": "<generated-staging-oauth-client-uuid>"
}
```

Call `public.mcp_provision_oauth_client(jsonb)` through the authenticated
Supabase RPC client. Do not accept a browser-supplied client ID that was not
bound to the current Supabase authorization details. The RPC rejects OAuth
tokens, inactive/non-admin users, deleted clients and extra input fields.
On success it idempotently:

- sets the policy audience to the validated per-environment resource URI;
- records the existing login AAL (AAL1 is valid) and enables the OAuth policy
  with `min_aal = 'aal1'`;
- attaches `accounting.read` and `accounting.expense.write`;
- creates or reuses a revocable grant whose lifetime is the OAuth grant; and
- appends a security audit event.

Supabase authorization-code access tokens can represent the exchanged OAuth
session as AAL1. The database records the real login assurance (commonly
`proof_at_grant_aal = 'aal1'`), permits the resulting OAuth token at
`min_aal = 'aal1'`, and never upgrades or fabricates the claim. AAL2 remains
mandatory for `mcp_accounting_approve_expense`, not for OAuth lifecycle RPCs.

The database grant has `expires_at = NULL` and does not expire independently.
This is required because a previously approved Supabase authorization can
redirect without rendering consent again. Access remains bounded by the
canonical OAuth grant, active Auth session, capabilities, policy, and manual
revocation. Never infer `client_id` from a callback query; provision only the ID
returned by verified Supabase authorization details.

Use `public.mcp_list_oauth_clients('{}'::jsonb)` from the same direct admin web
login to inspect the non-secret state. Use
`public.mcp_revoke_oauth_client_grant(jsonb)` with the same strict
`{"client_id":"..."}` body to revoke the current user's grant and active MCP
connections. Revocation is idempotent and does not delete the canonical Auth
client or globally disable other users' grants.

The web revoke flow must start the database RPC and
`auth.oauth.revokeGrant({ clientId })` independently so a timeout or failure in
one plane never prevents attempting the other. Database revocation immediately
stops the hook from issuing MCP `aud`, even if Auth revocation fails. Surface
partial outcomes, keep them retryable, and never restore a database grant to
mask an Auth failure.

After policy provisioning, start a new OAuth authorization flow or refresh the
token. Confirm the access token contains both:

- `client_id = <generated client UUID>`
- `role = mcp_authenticated`
- `aal = aal1`
- `aud = <the exact environment MCP resource URI>`

Do not issue production OAuth tokens before the MCP RLS/RPC fence and hook are
both installed.

## OAuth and authorization matrix

Verify all cases with real staging tokens:

| Case | Expected result |
|---|---|
| Correct `sub`, `client_id`, `session_id`, `role`, `aud`, active grant | Allowed |
| Existing direct web AAL1 active-admin login provisions a client | OAuth-lifetime grant created |
| Repeated provisioning for the same user/client | Same live grant, idempotent response |
| Inactive or non-admin direct web login provisions a client | `forbidden` |
| OAuth role calls provision/list/revoke/approve | Database/PostgREST denial |
| Deleted Auth OAuth client is provisioned | `oauth_client_not_active` |
| Any non-empty OAuth `client_id` passes through hook | `role = mcp_authenticated` |
| Enabled MCP client with matching `event.user_id/sub` and active grant | `aud` becomes the resource URI |
| Missing/disabled policy or revoked grant | Existing `aud` preserved; isolated role retained |
| OAuth Data API table/GraphQL/Storage/Realtime request | Denied |
| Repeated grant revocation | Successful idempotent no-op |
| Missing/wrong `aud` | `invalid_audience` |
| Disabled or deleted OAuth client | `client_not_allowed` |
| Revoked/expired grant | `missing_capability` |
| Deleted/expired `auth.sessions` row | `invalid_session` |
| Inactive, soft-deleted, or non-admin `sistema_users` actor | `forbidden` |
| OAuth token directly selecting/writing accounting tables | RLS denial |
| OAuth token calling a legacy financial RPC | PostgREST pre-request denial |
| MCP token issuing approval challenge | `human_approval_required` |
| Direct web AAL1 issuing/using challenge | `aal2_required` |
| Direct web AAL2, same user/session, live nonce | Approval succeeds |
| Commit with extra payload fields | `invalid_request` |
| Commit before approval | `approval_required` |
| Reused/wrong/expired nonce | Denied |
| Tampered normalized payload | `payload_tampered` |
| Disabled account after approval | `account_no_longer_eligible` |

## Preserve legacy web financial RPCs

The MCP migration deliberately does not change existing financial RPCs from
`SECURITY DEFINER` to invoker semantics. OAuth isolation is provided by
`mcp_authenticated`, its minimal grants, and the exact PostgREST pre-request
allowlist. Re-run this inventory before and after apply and confirm the
signatures and `prosecdef` values are unchanged:

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

Regression-test the existing web accounting screens without changing their RPC
execution semantics. A first-party web JWT has no `client_id` and keeps its
current behavior; an OAuth JWT must be rejected by the pre-request allowlist
before it can select a legacy RPC.

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
  has_function_privilege('mcp_authenticated', p.oid, 'execute') as mcp_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_execute,
  has_function_privilege('supabase_auth_admin', p.oid, 'execute') as auth_admin_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'mcp_%'
order by p.proname;
```

Confirm that machine RPCs are executable by `mcp_authenticated`, human
approval/lifecycle RPCs only by `authenticated`, the access-token hook only by
`supabase_auth_admin`, and the pre-request function only by the roles PostgREST
must invoke it as. Every MCP `SECURITY DEFINER` function must have an empty fixed
`search_path`; private tables must have no direct application privileges.

Also verify `mcp_authenticated` is `NOLOGIN`, `NOINHERIT`, owns no objects, and
has exactly the managed Supabase memberships: `authenticator` may use `SET`
without admin/inherit options, while `postgres` may retain platform
administration without `SET` or inheritance. Confirm no other role can reach
it, and that `authenticator.rolconfig` contains exactly
`pgrst.db_pre_request=public.mcp_postgrest_pre_request`.

## Enable last

Only after OAuth interoperability, the real staging PostgREST isolation gate,
RLS/RPC regression tests, pgTAP, advisors, and service end-to-end tests pass:

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

Do not weaken the technical role, pre-request allowlist, or restrictive
accounting-table policies during rollback. Any change to those controls requires
root-cause analysis and a staging regression run.
