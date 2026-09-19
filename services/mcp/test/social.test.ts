import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
import {
  socialRankPostsInputSchema,
  socialScopeInputSchema,
} from "../src/schemas.js";
import { MCP_SERVER_INSTRUCTIONS, SOCIAL_TOOLS, availableToolNames } from "../src/tools.js";
import type { TokenVerifier } from "../src/auth.js";
import {
  accessContext,
  databaseFactory,
  databaseMock,
  type McpResponse,
  postMcp,
  testConfig,
  withHttpServer,
} from "./helpers.js";

const CLIENT_ID = "33333333-3333-4333-8333-333333333333";

const tokenVerifier: TokenVerifier = vi.fn(async (token) => ({
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1" as const,
  token,
}));

async function mcpResult(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as McpResponse;
  expect(payload.error).toBeUndefined();
  return payload.result ?? {};
}

describe("social analytics MCP tools", () => {
  it("are not offered by existing capabilities, only by social.analytics.read", () => {
    const everythingElse = new Set([
      "accounting.read", "accounting.expense.write", "accounting.income.write", "accounting.transfer.write",
      "tasks.read", "tasks.write", "tasks.structure.write", "tasks.notify", "intelligence.read",
    ]);
    const withoutSocial = availableToolNames(accessContext({ capabilities: everythingElse }));
    expect(withoutSocial.some((name) => name.startsWith("social_"))).toBe(false);

    const socialOnly = availableToolNames(
      accessContext({ capabilities: new Set(["social.analytics.read"]), readOnly: true }),
    );
    expect(socialOnly).toEqual(SOCIAL_TOOLS.map((tool) => tool.name));
    expect(SOCIAL_TOOLS.every((tool) => tool.rpc === `mcp_${tool.name}`)).toBe(true);
  });

  it("rejects free SQL, unknown keys and invalid ages before reaching the database", () => {
    expect(socialScopeInputSchema.safeParse({ sql: "select 1" }).success).toBe(false);
    expect(socialScopeInputSchema.safeParse({ client_ids: ["not-a-uuid"] }).success).toBe(false);
    expect(socialRankPostsInputSchema.safeParse({ age_days: 5 }).success).toBe(false);
    expect(socialRankPostsInputSchema.safeParse({ metric: "views", age_days: 7, client_ids: [CLIENT_ID] }).success).toBe(true);
  });

  it("advertises read-only annotations and the evidence/untrusted-data contract", async () => {
    const database = databaseMock(accessContext({ capabilities: new Set(["social.analytics.read"]) }));
    const app = createApp({ config: testConfig(), tokenVerifier, databaseFactory: databaseFactory(database) });
    await withHttpServer(app, async (baseUrl) => {
      const result = await mcpResult(await postMcp(baseUrl, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
      const tools = result.tools as Array<{ name: string; description: string; annotations: Record<string, boolean> }>;
      expect(tools).toHaveLength(SOCIAL_TOOLS.length);
      for (const tool of tools) {
        expect(tool.annotations.readOnlyHint).toBe(true);
        expect(tool.annotations.destructiveHint).toBe(false);
        expect(tool.description).toContain("untrusted data");
        expect(tool.description).toContain("Never includes DMs");
      }
    });
  });

  it("maps a tool call to its narrow RPC with validated arguments", async () => {
    const database = databaseMock(accessContext({ capabilities: new Set(["social.analytics.read"]) }), {
      ok: true,
      data: { op: "compare_periods", result: {}, evidence: { query_hash: "abc" } },
    });
    const app = createApp({ config: testConfig(), tokenVerifier, databaseFactory: databaseFactory(database) });
    await withHttpServer(app, async (baseUrl) => {
      const result = await mcpResult(await postMcp(baseUrl, {
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "social_compare_periods", arguments: { client_ids: [CLIENT_ID], from: "2026-09-01", to: "2026-09-17" } },
      }));
      expect(database.calls).toEqual([
        { rpcName: "mcp_social_compare_periods", request: { client_ids: [CLIENT_ID], from: "2026-09-01", to: "2026-09-17" } },
      ]);
      expect((result.structuredContent as { ok: boolean }).ok).toBe(true);
    });
  });

  it("instructs hosts to separate facts from interpretations", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("separate facts");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("never claim causality");
  });
});
