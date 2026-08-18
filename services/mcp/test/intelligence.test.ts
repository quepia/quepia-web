import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
import { getProjectIntelligenceInputSchema } from "../src/schemas.js";
import {
  MCP_SERVER_INSTRUCTIONS,
  availableToolNames,
} from "../src/tools.js";
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

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

const tokenVerifier: TokenVerifier = vi.fn(async (token) => ({
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1" as const,
  token,
}));

async function mcpResult(
  response: Response,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as McpResponse;
  expect(payload.error).toBeUndefined();
  return payload.result ?? {};
}

describe("client intelligence input", () => {
  it("requires exactly one project selector", () => {
    expect(getProjectIntelligenceInputSchema.safeParse({}).success).toBe(false);
    expect(
      getProjectIntelligenceInputSchema.safeParse({
        project_id: PROJECT_ID,
        project_query: "Brandalise",
      }).success,
    ).toBe(false);
    expect(
      getProjectIntelligenceInputSchema.safeParse({
        project_id: PROJECT_ID,
      }).success,
    ).toBe(true);
    expect(
      getProjectIntelligenceInputSchema.safeParse({
        project_query: "Brandalise",
        include_sources: false,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields and malformed project ids", () => {
    expect(
      getProjectIntelligenceInputSchema.safeParse({
        project_id: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      getProjectIntelligenceInputSchema.safeParse({
        project_id: PROJECT_ID,
        include_drafts: true,
      }).success,
    ).toBe(false);
  });
});

describe("client intelligence MCP tool", () => {
  it("is isolated behind intelligence.read and remains available in read-only mode", () => {
    expect(availableToolNames(accessContext({ capabilities: new Set() }))).not.toContain(
      "intelligence_get_project_context",
    );
    expect(
      availableToolNames(
        accessContext({
          capabilities: new Set(["intelligence.read"]),
          readOnly: true,
        }),
      ),
    ).toEqual(["intelligence_get_project_context"]);
  });

  it("advertises a read-only project-context tool with the untrusted-data boundary", async () => {
    const database = databaseMock(
      accessContext({ capabilities: new Set(["intelligence.read"]) }),
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      });
      const result = await mcpResult(response);
      const tools = result.tools as Array<{
        name: string;
        description: string;
        annotations: Record<string, boolean>;
      }>;

      expect(tools).toHaveLength(1);
      expect(tools[0]).toMatchObject({
        name: "intelligence_get_project_context",
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      });
      expect(tools[0]?.description).toContain("human-reviewed strategy");
      expect(tools[0]?.description).toContain("untrusted data");
    });
  });

  it("maps the tool to the narrow project intelligence RPC", async () => {
    const responseData = {
      project: { id: PROJECT_ID, name: "Brandalise" },
      brief: { brand_name: "Brandalise" },
      strategy: { active_documents: [] },
    };
    const database = databaseMock(
      accessContext({ capabilities: new Set(["intelligence.read"]) }),
      { ok: true, data: responseData },
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "intelligence_get_project_context",
          arguments: {
            project_query: "Brandalise",
            include_sources: false,
          },
        },
      });
      const result = await mcpResult(response);

      expect(database.calls).toEqual([
        {
          rpcName: "mcp_intelligence_get_project_context",
          request: {
            project_query: "Brandalise",
            include_sources: false,
          },
        },
      ]);
      expect(result.structuredContent).toEqual({
        ok: true,
        data: responseData,
      });
    });
  });

  it("tells hosts to apply brief and approved strategy in the correct order", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain(
      "the user's explicit request, the client brief, the latest human-reviewed strategy, then research evidence",
    );
    expect(MCP_SERVER_INSTRUCTIONS).toContain(
      "unreviewed update is not active strategy",
    );
  });
});
