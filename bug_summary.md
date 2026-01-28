# Bug Report: Indefinite Hang on Supabase Insert (Next.js)

## Symptom
The application hangs indefinitely when attempting to `INSERT` a new row into the `sistema_assets` table via the Supabase Client in a Next.js application.

- **Client Behavior:** The `supabase.from('sistema_assets').insert(...)` promise never resolves or rejects. It stays in a pending state forever.
- **Console Logs:** tracing shows `invoking supabase.insert` but never reaches the `supabase response` log.
- **Server Logs:** The Next.js terminal has intermittently shown:
  ```
  {
    code: 'PGRST205',
    message: "Could not find the table 'public.sistema_assets' in the schema cache"
  }
  ```

## Environment
- **Stack:** Next.js (App Router), Supabase (PostgreSQL), TypeScript.
- **Context:** A Client Component `useAssets` hook calling a server-side action or direct client usage.

## Diagnostics & Attempts

### 1. Database-Side Checks (PASSED)
We created a standalone Node.js script (`test-connection.ts`) to isolate the database.
- **Read Test:** Successfully queried `sistema_assets`.
- **Write Test:** Successfully inserted a row into `sistema_assets` using both an anonymous client and an authenticated test user.
- **Conclusion:** The Database *is* capable of accepting writes. The RLS policies *allow* writes for valid users.

### 2. RLS & Recursion (Aggressively Ruled Out)
We suspected an infinite recursion loop in Row Level Security (RLS) policies (e.g., `Assets` -> `Projects` -> `Members` -> `Projects`...).
- **Fix 1:** Implemented `SECURITY DEFINER` helper functions (`is_project_member`) to bypass RLS during membership checks.
- **Fix 2 ("Nuclear"):** Dropped and re-created ALL policies for `projects`, `tasks`, `assets`, and `members` to strictly use the non-recursive helpers.
- **Fix 3 (Debug):** Temporarily **DISABLED RLS** on `sistema_assets`, `sistema_projects`, `sistema_tasks`, and `sistema_users`.
- **Result:** The application **still hangs** even with RLS completely disabled on these tables.

### 3. Triggers (Checked)
We audited `pg_trigger` for `sistema_assets`.
- Only standard Referential Integrity (RI) triggers and a logging trigger (`log_approval_change`) exist. nothing obviously blocking.

### 4. Schema Cache (Suspected)
Due to the `PGRST205` error in logs:
- **Action:** Ran `NOTIFY pgrst, 'reload schema'` multiple times.
- **Result:** Error logs persist intermittently, and the hang continues.

## Current Theory
There is a "Split Brain" issue between the Next.js application environment and the actual Database State.
1.  **Zombie Connection/Lock:** The Next.js server might be holding a stale connection or a lock that isn't clearing, causing requests to queue indefinitely.
2.  **Middleware/Env:** The `createClient` in the Next.js app might be misconfigured (e.g., pointing to a different environment, using a wrong key, or middleware stripping headers) compared to the working standalone script.
3.  **Supabase API Gateway:** The PostgREST instance serving the API might be stuck in a state where it hasn't refreshed the schema for the active connection pool, hence the `PGRST205` despite the table existing.

## Next Recommended Steps
1.  **Restart Supabase Project:** Force a restart of the database/API gateway to clear potential zombie locks and force a clean schema cache reload.
2.  **Verify Env Vars:** strict comparison of `.env.local` vs the credentials used in the successful `test-connection.ts`.
3.  **Network Inspection:** Confirm if the browser request is physically sent (Pending state) or if it's failed immediately (Blocked).
