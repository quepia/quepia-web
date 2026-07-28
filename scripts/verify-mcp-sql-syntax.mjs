import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  loadModule,
  parse,
  parsePlpgsqlBody,
} from "plpgsql-parser";

const projectRoot = resolve(import.meta.dirname, "..");
const migrationDirectory = join(projectRoot, "supabase", "migrations");
const expectedMigrationSuffixes = [
  "_create_mcp_accounting_control_plane.sql",
  "_mcp_oauth_onboarding.sql",
  "_mcp_hook_clock_timestamp.sql",
  "_mcp_pre_request_leading_slash.sql",
  "_mcp_direct_accounting_writes.sql",
  "_mcp_direct_writes_role_grants_and_allowlist.sql",
  "_mcp_tasks_control_plane.sql",
  "_mcp_tasks_read_rpcs.sql",
  "_mcp_tasks_write_rpcs.sql",
  "_mcp_tasks_detail_rpcs.sql",
  "_mcp_tasks_notifications_and_access.sql",
  "_mcp_tasks_notify_without_email.sql",
];
// These migrations are already applied remotely and must remain byte-for-byte
// immutable. Further fixes belong in a new forward-only migration.
const immutableAppliedMigrationSha256 = new Map([
  [
    "_create_mcp_accounting_control_plane.sql",
    "74f8ffe76290756427283b6d59b57a95fc24b42215e25cedb6de4d515cc59309",
  ],
  [
    "_mcp_oauth_onboarding.sql",
    "79dad9b6380421f0e431c5c2099654b5a7486ea3e8481a1b3456be2958a5e0c5",
  ],
  [
    "_mcp_hook_clock_timestamp.sql",
    "d96ecddbafadd521013fd46635dd7131b6a02950bad24ddecfb8da291a352b58",
  ],
]);
const migrationNames = readdirSync(migrationDirectory)
  .filter((name) =>
    expectedMigrationSuffixes.some((suffix) => name.endsWith(suffix)),
  )
  .sort();

if (
  migrationNames.length !== expectedMigrationSuffixes.length ||
  expectedMigrationSuffixes.some(
    (suffix) => !migrationNames.some((name) => name.endsWith(suffix)),
  )
) {
  throw new Error(
    `Expected MCP migrations ${expectedMigrationSuffixes.join(", ")}, found ${migrationNames.join(", ")}`,
  );
}

await loadModule();

const sql = migrationNames
  .map((name) => readFileSync(join(migrationDirectory, name), "utf8"))
  .join("\n");
const failures = [];

for (const [suffix, expectedSha256] of immutableAppliedMigrationSha256) {
  const migrationName = migrationNames.find((name) => name.endsWith(suffix));
  const migrationSha256 = createHash("sha256")
    .update(readFileSync(join(migrationDirectory, migrationName), "utf8"))
    .digest("hex");

  if (migrationSha256 !== expectedSha256) {
    failures.push({
      object: migrationName,
      error:
        "an already-applied MCP migration changed; add a new forward-only migration instead",
    });
  }
}

try {
  parse(sql);
} catch (error) {
  failures.push({
    object: migrationNames.join(", "),
    error: error instanceof Error ? error.message : String(error),
  });
}

const functionPattern =
  /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)([\s\S]*?)\nAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\3\s*;/gi;
let functionMatch;
let functionCount = 0;
let plpgsqlCount = 0;
let sqlFunctionCount = 0;

while ((functionMatch = functionPattern.exec(sql)) !== null) {
  functionCount += 1;
  const [, functionName, header, , body] = functionMatch;

  try {
    if (/LANGUAGE\s+plpgsql/i.test(header)) {
      plpgsqlCount += 1;
      parsePlpgsqlBody(functionMatch[0]);
    } else if (/LANGUAGE\s+SQL/i.test(header)) {
      sqlFunctionCount += 1;
      parse(body);
    }
  } catch (error) {
    failures.push({
      object: functionName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const doPattern = /DO\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1\s*;/gi;
let doMatch;
let doBlockCount = 0;

while ((doMatch = doPattern.exec(sql)) !== null) {
  doBlockCount += 1;
  const wrappedBlock = [
    `CREATE FUNCTION __mcp_do_${doBlockCount}()`,
    "RETURNS void",
    "LANGUAGE plpgsql",
    "AS $mcp_do_wrapper$",
    doMatch[2],
    "$mcp_do_wrapper$;",
  ].join("\n");

  try {
    parsePlpgsqlBody(wrappedBlock);
  } catch (error) {
    failures.push({
      object: `DO block ${doMatch[1]}`,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const testPath = join(
  projectRoot,
  "supabase",
  "tests",
  "mcp_accounting_control_plane_test.sql",
);
const testSql = readFileSync(testPath, "utf8");

try {
  parse(testSql);
} catch (error) {
  failures.push({
    object: "mcp_accounting_control_plane_test.sql",
    error: error instanceof Error ? error.message : String(error),
  });
}

const plannedAssertions = Number(
  /SELECT\s+plan\((\d+)\)/i.exec(testSql)?.[1] ?? Number.NaN,
);
const assertionCount = [
  ...testSql.matchAll(
    /^SELECT\s+(?:ok|is|isnt|matches|throws_ok|lives_ok|cmp_ok)\s*\(/gim,
  ),
].length;

if (
  !Number.isInteger(plannedAssertions) ||
  plannedAssertions !== assertionCount
) {
  failures.push({
    object: "mcp_accounting_control_plane_test.sql",
    error: `pgTAP plan declares ${plannedAssertions} assertions but ${assertionCount} were found`,
  });
}

if (failures.length > 0) {
  console.error("MCP SQL syntax verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure.object}: ${failure.error}`);
  }
  process.exit(1);
}

console.log(
  `MCP SQL syntax verification passed: ${functionCount} functions (${plpgsqlCount} PL/pgSQL, ${sqlFunctionCount} SQL), ${doBlockCount} DO blocks, and ${assertionCount} pgTAP assertions parsed.`,
);
