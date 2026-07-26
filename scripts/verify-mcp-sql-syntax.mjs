import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  loadModule,
  parse,
  parsePlpgsqlBody,
} from "plpgsql-parser";

const projectRoot = resolve(import.meta.dirname, "..");
const migrationDirectory = join(projectRoot, "supabase", "migrations");
const migrationNames = readdirSync(migrationDirectory).filter((name) =>
  /_create_mcp_accounting_control_plane\.sql$/.test(name),
);

if (migrationNames.length !== 1) {
  throw new Error(
    `Expected exactly one MCP control-plane migration, found ${migrationNames.length}`,
  );
}

await loadModule();

const migrationPath = join(migrationDirectory, migrationNames[0]);
const sql = readFileSync(migrationPath, "utf8");
const failures = [];

try {
  parse(sql);
} catch (error) {
  failures.push({
    object: migrationNames[0],
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
