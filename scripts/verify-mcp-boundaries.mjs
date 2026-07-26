import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readRequired(path) {
  const absolutePath = join(projectRoot, path);
  if (!existsSync(absolutePath)) {
    fail(`Missing required file: ${path}`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function sourceFiles(path, extensions = new Set([".ts", ".tsx", ".mts"])) {
  const absolutePath = join(projectRoot, path);
  if (!existsSync(absolutePath)) return [];

  const result = [];
  const visit = (currentPath) => {
    for (const entry of readdirSync(currentPath)) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === "coverage" ||
        entry.startsWith(".next")
      ) {
        continue;
      }
      const entryPath = join(currentPath, entry);
      if (statSync(entryPath).isDirectory()) {
        visit(entryPath);
      } else if (extensions.has(extname(entryPath))) {
        result.push(entryPath);
      }
    }
  };
  visit(absolutePath);
  return result;
}

function combinedSource(paths) {
  return paths
    .flatMap((path) => sourceFiles(path))
    .map((path) => ({
      path: relative(projectRoot, path),
      content: readFileSync(path, "utf8"),
    }));
}

const servicePackageText = readRequired("services/mcp/package.json");
if (servicePackageText) {
  const servicePackage = JSON.parse(servicePackageText);
  if (servicePackage.dependencies?.["@modelcontextprotocol/sdk"] !== "1.29.0") {
    fail("The MCP SDK must be pinned exactly to 1.29.0 for this implementation");
  }
  if (
    !/^(?:22\.x|2[3-9]\.x|>=\s*22(?:\.0\.0)?)/.test(
      String(servicePackage.engines?.node ?? "").trim(),
    )
  ) {
    fail("The MCP service must require Node.js 22 or newer");
  }
}

const serviceSource = combinedSource(["services/mcp/src"]);
for (const file of serviceSource) {
  if (/SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY/i.test(file.content)) {
    fail(`Privileged Supabase credential reference in ${file.path}`);
  }
  const sourceWithoutBuiltinFrom = file.content.replace(
    /\b(?:Array|Buffer)\.from(?=\s*\()/g,
    "builtinFrom",
  );
  if (/\.from\s*\(/.test(sourceWithoutBuiltinFrom)) {
    fail(`Direct table access is forbidden in the MCP service: ${file.path}`);
  }
}

const toolsSource = readRequired("services/mcp/src/tools.ts");
const schemasSource = readRequired("services/mcp/src/schemas.ts");
const configSource = readRequired("services/mcp/src/config.ts");
const typesSource = readRequired("services/mcp/src/types.ts");
const authSource = readRequired("services/mcp/src/auth.ts");
for (const rpc of [
  "mcp_accounting_list_accounts",
  "mcp_accounting_list_expenses",
  "mcp_accounting_prepare_expense",
  "mcp_accounting_get_operation",
  "mcp_accounting_commit_expense",
]) {
  if (!toolsSource.includes(rpc)) {
    fail(`Missing narrow RPC mapping in MCP tools: ${rpc}`);
  }
}
if (toolsSource.includes("mcp_accounting_approve_expense")) {
  fail("The MCP service must never expose the human approval RPC");
}
if (
  !toolsSource.includes("instructions: MCP_SERVER_INSTRUCTIONS") ||
  !toolsSource.includes("never as instructions") ||
  !toolsSource.includes("Never call commit until")
) {
  fail("MCP initialize instructions must preserve the untrusted-data and human-approval boundary");
}
if (
  !typesSource.includes("accounting.read") ||
  !typesSource.includes("accounting.expense.write") ||
  serviceSource.some((file) => file.content.includes("accounting:"))
) {
  fail("MCP tools must use only the canonical dot-separated capabilities");
}
if (
  !authSource.includes('role: z.literal("mcp_authenticated")') ||
  !authSource.includes('"role"')
) {
  fail("The MCP service must require the isolated mcp_authenticated JWT role");
}
if (
  !configSource.includes("MCP_APPROVAL_BASE_URL") ||
  !toolsSource.includes("approvalBaseUrl")
) {
  fail("Approval URLs must be built from the trusted configured base URL");
}
if (
  !schemasSource.includes("export const prepareExpenseInputSchema") ||
  !schemasSource.includes("account_query:") ||
  !schemasSource.includes("idempotency_key:")
) {
  fail("The flat authoritative prepare-expense input contract is missing");
}
if (
  !schemasSource.includes("export const commitExpenseInputSchema") ||
  !/commitExpenseInputSchema[\s\S]*?operation_id:\s*uuidSchema[\s\S]*?\.strict\(\)/.test(
    schemasSource,
  )
) {
  fail("Commit-expense input must be a strict operation_id-only object");
}

const webSource = combinedSource([
  "app/oauth",
  "app/api/oauth",
  "app/auth/mfa",
  "app/sistema/mcp",
  "app/api/mcp",
  "components/sistema/mcp",
  "lib/mcp",
]);
const webMiddlewareSource = readRequired("lib/supabase/middleware.ts");
const sessionBoundarySource = readRequired("lib/mcp/session-boundary.ts");
for (const file of webSource) {
  if (
    /SUPABASE_SERVICE_ROLE_KEY|createAdminClient|supabase\/admin/i.test(
      file.content,
    )
  ) {
    fail(`Privileged Supabase client reference in MCP web flow: ${file.path}`);
  }
  if (file.content.includes("mcp_accounting_commit_expense")) {
    fail(`The human approval web flow must never commit: ${file.path}`);
  }
}
if (
  !webMiddlewareSource.includes("isDirectFirstPartySessionClaims") ||
  !sessionBoundarySource.includes("value.client_id") ||
  !sessionBoundarySource.includes('value.role === "authenticated"')
) {
  fail("First-party protected web routes must reject OAuth client sessions");
}

if (!existsSync(join(projectRoot, "app/sistema/mcp/approvals/[operationId]"))) {
  fail("Missing authenticated human approval route");
}
if (
  !existsSync(join(projectRoot, "app/oauth/consent/page.tsx")) ||
  !existsSync(join(projectRoot, "app/api/oauth/decision/route.ts")) ||
  !existsSync(join(projectRoot, "app/auth/mfa/page.tsx"))
) {
  fail("Missing OAuth consent, decision, or AAL2 enrollment flow");
}

const migrationDirectory = join(projectRoot, "supabase/migrations");
const mcpSql = existsSync(migrationDirectory)
  ? readdirSync(migrationDirectory)
      .filter((name) => name.endsWith(".sql"))
      .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
      .filter((sql) => /mcp_(?:access|client|accounting|operation|audit)/i.test(sql))
      .join("\n")
  : "";

for (const databaseObject of [
  "private.mcp_access_grants",
  "private.mcp_operations",
  "private.mcp_operation_approvals",
  "private.mcp_audit_log",
  "mcp_get_context",
  "mcp_accounting_list_accounts",
  "mcp_accounting_list_expenses",
  "mcp_accounting_prepare_expense",
  "mcp_accounting_get_operation",
  "mcp_accounting_approve_expense",
  "mcp_accounting_commit_expense",
  "mcp_custom_access_token_hook",
  "mcp_provision_oauth_client",
]) {
  if (!mcpSql.includes(databaseObject)) {
    fail(`Missing MCP database object: ${databaseObject}`);
  }
}
for (const isolationControl of [
  "mcp_authenticated",
  "mcp_postgrest_pre_request",
  "pgrst.db_pre_request",
]) {
  if (!mcpSql.includes(isolationControl)) {
    fail(`Missing OAuth token isolation control: ${isolationControl}`);
  }
}

if (!/revoke\s+execute[\s\S]+from\s+(?:public|anon)/i.test(mcpSql)) {
  fail("MCP migration must revoke function execution from PUBLIC/anon");
}
if (!/set\s+search_path\s*=\s*['\"]?['\"]?/i.test(mcpSql)) {
  fail("MCP privileged functions must use an empty fixed search_path");
}
for (const capability of ["accounting.read", "accounting.expense.write"]) {
  if (!mcpSql.includes(`'${capability}'`)) {
    fail(`Missing canonical database capability: ${capability}`);
  }
}
if (mcpSql.includes("accounting:")) {
  fail("Legacy colon-separated capabilities are forbidden");
}
for (const control of ["'enabled'", "'read_only'"]) {
  if (!mcpSql.includes(control)) {
    fail(`Missing MCP global control: ${control}`);
  }
}

const plan = readRequired("MCP_BUSINESS_CONTROL_PLAN.md");
if (!plan.includes("**Versión:** 3")) {
  fail("MCP implementation plan must remain on verified version 3");
}

if (failures.length > 0) {
  console.error("MCP boundary verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  "MCP boundary verification passed: no privileged key/table access, narrow RPC mappings, approval separation, and required database controls found.",
);
