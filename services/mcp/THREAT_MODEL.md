# Threat model and operating assumptions

## Protected assets

- accounting data and balances;
- pending expense operations and approvals;
- OAuth access, refresh, and authorization codes;
- user, OAuth client, session, grant, and capability identity;
- Supabase public project configuration.

## Trust boundaries

The MCP client, model output, all tool arguments, cursors, HTTP headers, and
public network are untrusted. Supabase Auth is trusted to issue signed tokens.
Narrow database RPCs are the final authorization and business-integrity
boundary. The approval web UI is a separate trusted human interaction channel.

The model is never considered an approver. A preview hash returned to the model
is informative, not an approval credential.

All database-returned text is attacker-controlled data. Account names, expense
descriptions, providers, notes, labels, and error details must never be treated
as tool instructions, system prompts, approval signals, or authorization data.

## Enforced by this service

- asymmetric JWT signature through the configured Supabase JWKS;
- exact issuer, expiry, subject, client, session, assurance level, and canonical
  MCP audience;
- no symmetric JWT algorithms;
- one Bearer token on every `/mcp` request and no token in query strings;
- no token persistence or token logging;
- fresh `mcp_get_context` evaluation for every request;
- capability-filtered tool registration and global read-only filtering;
- strict Zod inputs, canonical decimal money, bounded strings/page sizes, ISO
  dates, UUID operations/idempotency keys, and opaque bounded cursors;
- commit payload restricted to an operation UUID;
- approval URLs built only from a configured trusted web origin and a
  database-returned UUID validated by the service;
- exact allowlists for Host and any supplied Origin;
- request body and application/database timeout bounds;
- stateless transport with no session identifier to steal;
- only publishable/legacy anon Supabase API keys accepted at startup;
- only narrow RPC calls with the user's Authorization context.

## Required database guarantees

The SQL implementation must independently enforce every authorization and
business rule. In particular:

- `mcp_get_context` must validate the active OAuth client, grant, user and
  `auth.sessions` row for the JWT `session_id`;
- every domain RPC must repeat the relevant client/session/grant/capability and
  global kill-switch checks;
- OAuth JWTs must use the isolated `mcp_authenticated` Postgres role;
- every Data API request with `client_id` must be gated to the exact MCP RPC
  allowlist, so public tables and unrelated RPCs are unreachable;
- privileged functions must use a fixed `search_path`, revoke execute from
  `PUBLIC`/`anon`, and grant only to the intended web or MCP role;
- RPC identity must come from verified JWT claims, never from `p_request`;
- prepare must canonicalize and hash its immutable server payload;
- human approval must be recorded server-side, with expiry and one-time use;
- commit must use row locking and atomically enforce approval, payload binding,
  idempotency, ownership, expiry, and single consumption;
- successful business writes and audit records must commit atomically;
- failed/rejected attempts require an out-of-transaction audit or structured
  security log because a rolled-back transaction cannot preserve its own log;
- RPC responses must not contain credentials, internal SQL, stack traces, or
  sensitive account secrets.

## Deployment assumptions

- production traffic is HTTPS; TLS termination and certificate management occur
  at the reverse proxy/platform;
- the proxy preserves the intended Host and never records Authorization;
- WAF/rate limiting and connection concurrency are enforced outside this
  process, while business quotas are enforced atomically in the database;
- egress is restricted to the configured Supabase project/JWKS where the
  platform supports it;
- clocks are synchronized so JWT expiry and operation TTL checks are reliable;
- secrets and deployment configuration are managed outside the repository;
- logs are collected with access controls and retention limits.

## Residual risks

- a valid token can be replayed until expiry unless the database context rejects
  its session on every request; keep access-token lifetimes short;
- a compromised approved MCP client can act within its granted capabilities;
- denial of service remains possible without platform-level rate/concurrency
  controls;
- user-visible approval safety depends on the web UI accurately presenting the
  immutable database payload;
- Supabase OAuth, MCP protocol, and SDK behavior evolve; repeat the staging
  interoperability matrix before upgrades or production rollout.

## Required pre-production tests

- OAuth discovery, PKCE, `resource` on authorization and token requests, and
  successful 2xx token exchange;
- JWKS key rotation and cache refresh;
- wrong issuer/audience/client/session, expired tokens, revoked session/grant,
  disabled client, and global read-only mode;
- direct Data API and legacy RPC attempts cannot bypass the narrow MCP RPCs;
- prepare, external approval, commit, retry-after-timeout, duplicate
  idempotency, expiry, payload tampering, concurrency, and revocation between
  prepare and commit;
- proxy Host/Origin behavior, body limits, timeouts, redacted logs, and rate
  limits.
