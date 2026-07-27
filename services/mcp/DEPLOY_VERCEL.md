# Independent Vercel deployment

This service is designed to be a separate Vercel Express project. It must not
be bundled into or deployed as part of the Quepia Next.js web application.

No `vercel.json` is required. Vercel's native Express support detects
`src/index.ts` and deploys its default-exported Express application as one Node
Vercel Function. The local listener lives in `src/local.ts` and is not imported
by the serverless entrypoint.

## Project configuration

Create or link a dedicated Vercel project with:

- **Root Directory:** `services/mcp`
- **Framework:** Express, automatically detected
- **Install Command:** automatic npm install from this directory's
  `package-lock.json`
- **Build Command:** automatic Express build; do not point it at the root
  Next.js build
- **Node.js:** 22 or newer

Do not add the MCP dependencies to the repository root. Do not set the web
project's Root Directory to this service.

## Required runtime environment

Configure every variable from `.env.example` in the dedicated Vercel project.
At minimum:

- `MCP_RESOURCE_URI=https://<stable-mcp-domain>/mcp`
- `MCP_APPROVAL_BASE_URL=https://<first-party-web-domain>`
- `MCP_ALLOWED_HOSTS=<stable-mcp-domain>`
- `MCP_ALLOWED_ORIGINS=<explicit-browser-origins>` — must include
  `https://claude.ai` (and `https://claude.com`) for Claude web and desktop to
  connect. A missing origin fails the CORS preflight with `403`, which those
  clients surface as "Couldn't connect to the server".
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never configure a Supabase secret or privileged legacy key. Startup rejects
those values.

The resource URI is also the required JWT audience. Use a stable custom domain
for staging and another for production. A random preview deployment hostname
cannot reuse a token whose audience targets production. Each environment needs
an OAuth client/access-token hook and audience that exactly match its stable
resource URI.

Deployment Protection can also block third-party MCP/OAuth clients on preview
URLs. Validate preview/staging access policy before interoperability testing.

## Local Vercel validation without deployment

The Vercel CLI is pinned in scripts to `57.0.0` without adding it to production
dependencies.

```bash
npm ci
npm test
npm run typecheck
npm run compile
npm run vercel:dev
```

After the project is explicitly linked and its environment has been pulled, a
local Vercel build can be performed without deploying:

```bash
npx --yes vercel@57.0.0 pull
npm run vercel:build
```

`vercel:build` only creates a local `.vercel/output` artifact. It does not
deploy. Do not run `vercel deploy`, `vercel --prod`, or promote a deployment
until OAuth and database migrations have passed staging verification.

## Pre-deployment gate

Before the first preview or production deployment:

1. Run the service tests, typecheck, TypeScript build, and production dependency
   audit.
2. Run the repository MCP boundary and SQL verification scripts.
3. Apply and verify the database migration in staging.
4. Enable Supabase OAuth in staging, configure the exact audience hook, and
   complete PKCE/resource/JWKS/revocation interoperability tests.
5. Verify `/health`, both protected-resource metadata paths, authenticated
   `/mcp`, capability filtering, approval URL, external approval, and commit.
6. Confirm Vercel Firewall/rate limits and that Authorization headers are
   redacted from logs.

The application is stateless and uses JSON responses for MCP requests, so it
does not depend on a persistent listener, in-memory session affinity, or a
long-lived standalone SSE connection.

## Rollback

Application rollback is a Vercel project rollback or promotion of a previously
verified deployment. Database rollback is separate and must follow the MCP
database runbook. Never roll back application code to a version whose RPC
contract differs from the active database schema.

Official references:

- [Express on Vercel](https://vercel.com/docs/frameworks/backend/express)
- [Backends on Vercel](https://vercel.com/docs/frameworks/backend)
- [Vercel Functions](https://vercel.com/docs/functions)
