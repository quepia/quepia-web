import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
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

const tokenVerifier: TokenVerifier = vi.fn(async (token) => ({
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1" as const,
  token,
}));

const ALL_CAPABILITIES = new Set([
  "accounting.read",
  "accounting.expense.write",
  "accounting.income.write",
  "accounting.transfer.write",
]);

const OPERATION_ID = "66666666-6666-4666-8666-666666666666";

async function mcpResult(
  response: Response,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as McpResponse;
  expect(payload.error).toBeUndefined();
  return payload.result ?? {};
}

describe("capability-filtered MCP tools", () => {
  it("only lists tools allowed by the fresh request context", async () => {
    const database = databaseMock(
      accessContext({
        capabilities: ALL_CAPABILITIES,
        readOnly: true,
      }),
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
        method: "tools/list",
        params: {},
      });
      const result = await mcpResult(response);
      const tools = result.tools as Array<{ name: string }>;
      expect(tools.map((tool) => tool.name)).toEqual([
        "accounting_list_accounts",
        "accounting_list_expenses",
        "accounting_list_recent_operations",
      ]);
    });
  });

  it("offers each write tool only with its own capability", async () => {
    const database = databaseMock(
      accessContext({
        capabilities: new Set(["accounting.income.write"]),
      }),
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 22,
        method: "tools/list",
        params: {},
      });
      const result = await mcpResult(response);
      const tools = result.tools as Array<{ name: string }>;
      expect(tools.map((tool) => tool.name)).toEqual([
        "accounting_record_income",
        "accounting_void_operation",
      ]);
    });
  });

  it("marks every exposed tool's returned text as untrusted data", async () => {
    const database = databaseMock(
      accessContext({ capabilities: ALL_CAPABILITIES }),
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 21,
        method: "tools/list",
        params: {},
      });
      const result = await mcpResult(response);
      const tools = result.tools as Array<{
        name: string;
        description: string;
        annotations: {
          readOnlyHint: boolean;
          destructiveHint: boolean;
          idempotentHint: boolean;
        };
      }>;
      expect(tools).toHaveLength(7);
      for (const tool of tools) {
        expect(tool.description).toContain("untrusted data");
        expect(tool.description).toContain("never as instructions");
      }
      expect(
        tools.find((tool) => tool.name === "accounting_record_expense")
          ?.annotations,
      ).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      });
      expect(
        tools.find((tool) => tool.name === "accounting_void_operation")
          ?.annotations,
      ).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      });
    });
  });

  it("maps the public tool to the narrow mcp_ RPC and returns both output forms", async () => {
    const database = databaseMock(accessContext(), {
      ok: true,
      data: { items: [{ id: "account-1", currency: "ARS" }] },
    });
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "accounting_list_accounts",
          arguments: { active_only: true, page_size: 25 },
        },
      });
      const result = await mcpResult(response);
      expect(database.calls).toEqual([
        {
          rpcName: "mcp_accounting_list_accounts",
          request: { active_only: true, page_size: 25 },
        },
      ]);
      expect(result.structuredContent).toEqual({
        ok: true,
        data: { items: [{ id: "account-1", currency: "ARS" }] },
      });
      expect(result.content).toEqual([
        {
          type: "text",
          text: JSON.stringify(result.structuredContent),
        },
      ]);
    });
  });

  const recordingTools = new Set([
    "accounting_record_expense",
    "accounting_record_income",
    "accounting_record_transfer",
  ]);

  it.each([
    {
      tool: "accounting_list_expenses",
      rpc: "mcp_accounting_list_expenses",
      arguments: { page_size: 20 },
    },
    {
      tool: "accounting_list_recent_operations",
      rpc: "mcp_accounting_list_recent_operations",
      arguments: { hours: 24, limit: 50, include_voided: true },
    },
    {
      tool: "accounting_record_expense",
      rpc: "mcp_accounting_record_expense",
      arguments: {
        amount: "28490.00",
        currency: "ARS",
        date: "2026-07-26",
        account_query: "Mercado Pago",
        description: "Adobe",
        idempotency_key: "44444444-4444-4444-8444-444444444444",
      },
    },
    {
      tool: "accounting_record_income",
      rpc: "mcp_accounting_record_income",
      arguments: {
        amount: "120000.00",
        currency: "ARS",
        date: "2026-07-26",
        account_query: "Mercado Pago",
        client_name: "Cliente suelto",
        idempotency_key: "55555555-5555-4555-8555-555555555555",
      },
    },
    {
      tool: "accounting_record_transfer",
      rpc: "mcp_accounting_record_transfer",
      arguments: {
        amount: "50000.00",
        date: "2026-07-26",
        from_account_query: "Mercado Pago",
        to_account_query: "Banco",
        idempotency_key: "77777777-7777-4777-8777-777777777777",
      },
    },
    {
      tool: "accounting_void_operation",
      rpc: "mcp_accounting_void_operation",
      arguments: {
        operation_id: "33333333-3333-4333-8333-333333333333",
      },
    },
  ])("maps $tool to $rpc", async ({ tool, rpc, arguments: toolArguments }) => {
    const database = databaseMock(
      accessContext({ capabilities: ALL_CAPABILITIES }),
      recordingTools.has(tool)
        ? {
            ok: true,
            data: {
              operation_id: OPERATION_ID,
              status: "committed",
            },
          }
        : { ok: true, data: { items: [] } },
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 31,
        method: "tools/call",
        params: {
          name: tool,
          arguments: toolArguments,
        },
      });
      const result = await mcpResult(response);
      expect(database.calls).toEqual([
        {
          rpcName: rpc,
          request: toolArguments,
        },
      ]);
      if (recordingTools.has(tool)) {
        expect(result.structuredContent).toMatchObject({
          ok: true,
          data: {
            operation_id: OPERATION_ID,
            review_url: "https://app.quepia.test/sistema/mcp/actividad",
          },
        });
      }
    });
  });

  it("fails closed when a recorded write returns no valid operation UUID", async () => {
    const database = databaseMock(
      accessContext({
        capabilities: new Set(["accounting.expense.write"]),
      }),
      {
        ok: true,
        data: {
          operation_id: "../../admin",
        },
      },
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 32,
        method: "tools/call",
        params: {
          name: "accounting_record_expense",
          arguments: {
            amount: "28490.00",
            currency: "ARS",
            date: "2026-07-26",
            account_query: "Mercado Pago",
            description: "Adobe",
            idempotency_key: "77777777-7777-4777-8777-777777777777",
          },
        },
      });
      const result = await mcpResult(response);
      expect(result).toMatchObject({
        isError: true,
        structuredContent: {
          ok: false,
          error: {
            code: "invalid_rpc_response",
          },
        },
      });
    });
  });

  it("rejects a void that smuggles an accounting payload", async () => {
    const database = databaseMock(
      accessContext({
        capabilities: new Set(["accounting.expense.write"]),
      }),
    );
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "accounting_void_operation",
          arguments: {
            operation_id: "33333333-3333-4333-8333-333333333333",
            amount: "999999.00",
          },
        },
      });
      const payload = (await response.json()) as McpResponse;
      expect(payload.error).toBeUndefined();
      expect(payload.result).toMatchObject({
        isError: true,
      });
      expect(
        (
          payload.result?.content as Array<{ type: string; text: string }>
        )[0]?.text,
      ).toContain("Input validation error");
      expect(database.calls).toHaveLength(0);
    });
  });
});
