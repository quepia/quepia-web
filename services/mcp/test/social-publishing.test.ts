import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
import {
  socialAttachMediaInputSchema,
  socialPublishTaskInputSchema,
} from "../src/schemas.js";
import {
  MCP_SERVER_INSTRUCTIONS,
  SOCIAL_PUBLISHING_TOOLS,
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

const TASK_ID = "44444444-4444-4444-8444-444444444444";
const ASSET_ID = "55555555-5555-4555-8555-555555555555";
const KEY = "66666666-6666-4666-8666-666666666666";
const PUBLICATION_ID = "77777777-7777-4777-8777-777777777777";

const tokenVerifier: TokenVerifier = vi.fn(async (token) => ({
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1" as const,
  token,
}));

const publishCapability = new Set(["social.publish.write"]);

async function mcpResult(response: Response): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as McpResponse;
  expect(payload.error).toBeUndefined();
  return payload.result ?? {};
}

describe("social publishing MCP tools", () => {
  it("are offered only with social.publish.write and keep only reads in read-only mode", () => {
    const others = new Set(["tasks.read", "tasks.write", "social.analytics.read", "intelligence.read"]);
    expect(availableToolNames(accessContext({ capabilities: others }))
      .some((name) => SOCIAL_PUBLISHING_TOOLS.some((tool) => tool.name === name))).toBe(false);

    expect(availableToolNames(accessContext({ capabilities: publishCapability })))
      .toEqual(SOCIAL_PUBLISHING_TOOLS.map((tool) => tool.name));
    expect(availableToolNames(accessContext({ capabilities: publishCapability, readOnly: true })))
      .toEqual(["social_list_publish_targets", "social_list_publications"]);
  });

  it("validates schedule, copy and media sources before reaching the web", () => {
    const base = { task_id: TASK_ID, idempotency_key: KEY, content: "Copy", account_ids: ["acc_1"] };
    expect(socialPublishTaskInputSchema.safeParse({ ...base, mode: "schedule" }).success).toBe(false);
    expect(socialPublishTaskInputSchema.safeParse({ ...base, mode: "now", scheduled_for: "2026-11-25T19:30:00-03:00" }).success).toBe(false);
    expect(socialPublishTaskInputSchema.safeParse({ ...base, mode: "schedule", scheduled_for: "2026-11-25T19:30:00-03:00" }).success).toBe(true);
    expect(socialPublishTaskInputSchema.safeParse({ ...base, content: " ", mode: "draft" }).success).toBe(false);
    expect(socialPublishTaskInputSchema.safeParse({ ...base, mode: "draft", zernio_profile_id: "x" }).success).toBe(false);

    expect(socialAttachMediaInputSchema.safeParse({ task_id: TASK_ID, items: [{ source_url: "http://example.com/a.mp4" }] }).success).toBe(false);
    expect(socialAttachMediaInputSchema.safeParse({ task_id: TASK_ID, items: [{}] }).success).toBe(false);
    expect(socialAttachMediaInputSchema.safeParse({
      task_id: TASK_ID,
      items: [{ source_url: "https://cdn.example.com/a.mp4", upload_path: "p" }],
    }).success).toBe(false);
    expect(socialAttachMediaInputSchema.safeParse({ task_id: TASK_ID, items: [{ source_url: "https://cdn.example.com/a.mp4" }] }).success).toBe(true);
  });

  it("annotates cancel and remove as destructive and publish as open world", async () => {
    const database = databaseMock(accessContext({ capabilities: publishCapability }));
    const app = createApp({ config: testConfig(), tokenVerifier, databaseFactory: databaseFactory(database) });
    await withHttpServer(app, async (baseUrl) => {
      const result = await mcpResult(await postMcp(baseUrl, { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }));
      const tools = result.tools as Array<{ name: string; description: string; annotations: Record<string, boolean> }>;
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      expect(byName.get("social_cancel_publication")?.annotations.destructiveHint).toBe(true);
      expect(byName.get("social_remove_media")?.annotations.destructiveHint).toBe(true);
      expect(byName.get("social_publish_task")?.annotations.openWorldHint).toBe(true);
      expect(byName.get("social_list_publications")?.annotations.readOnlyHint).toBe(true);
      for (const tool of tools) expect(tool.description).toContain("untrusted data");
    });
  });

  it("forwards validated calls to the web publishing endpoint", async () => {
    const database = databaseMock(accessContext({ capabilities: publishCapability }), {
      ok: true,
      data: { publication: { id: PUBLICATION_ID, status: "scheduled" } },
    });
    const app = createApp({ config: testConfig(), tokenVerifier, databaseFactory: databaseFactory(database) });
    await withHttpServer(app, async (baseUrl) => {
      const args = {
        task_id: TASK_ID,
        idempotency_key: KEY,
        mode: "schedule",
        scheduled_for: "2026-11-25T19:30:00-03:00",
        content: "Copy final",
        account_ids: ["acc_1"],
        asset_ids: [ASSET_ID],
        instagram: { is_ai_generated: true },
      };
      const result = await mcpResult(await postMcp(baseUrl, {
        jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "social_publish_task", arguments: args },
      }));
      expect(database.socialCalls).toEqual([
        { action: "publish", request: { ...args, save_copy_to_task: true } },
      ]);
      expect(database.calls).toEqual([]);
      expect((result.structuredContent as { ok: boolean }).ok).toBe(true);

      await mcpResult(await postMcp(baseUrl, {
        jsonrpc: "2.0", id: 3, method: "tools/call",
        params: { name: "social_cancel_publication", arguments: { publication_id: PUBLICATION_ID } },
      }));
      expect(database.socialCalls.at(-1)).toEqual({ action: "cancel", request: { publication_id: PUBLICATION_ID } });
    });
  });

  it("asks hosts to confirm before publishing or scheduling", () => {
    expect(MCP_SERVER_INSTRUCTIONS).toContain("get the user's confirmation");
    expect(MCP_SERVER_INSTRUCTIONS).toContain("same idempotency_key");
  });
});
