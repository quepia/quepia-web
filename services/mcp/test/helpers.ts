import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type express from "express";
import type { AppConfig } from "../src/config.js";
import type {
  DatabaseAccess,
  DatabaseAccessFactory,
  McpAccessContext,
  RpcEnvelope,
} from "../src/types.js";

export function testConfig(
  overrides: Partial<AppConfig> = {},
): AppConfig {
  return {
    environment: "test",
    host: "127.0.0.1",
    port: 3001,
    resourceUri: "https://mcp.quepia.test/mcp",
    resourceMetadataUri:
      "https://mcp.quepia.test/.well-known/oauth-protected-resource/mcp",
    approvalBaseUrl: "https://app.quepia.test",
    allowedOrigins: new Set(["https://app.quepia.test"]),
    allowedHosts: new Set(["mcp.quepia.test", "127.0.0.1"]),
    protocolVersions: new Set([
      "2025-11-25",
      "2025-06-18",
      "2025-03-26",
    ]),
    oauthScopes: ["openid", "profile", "email"],
    requestBodyLimitBytes: 65_536,
    requestTimeoutMs: 5_000,
    databaseTimeoutMs: 1_000,
    supabaseUrl: "https://project.supabase.co",
    supabasePublishableKey: "sb_publishable_test",
    supabaseJwksUrl:
      "https://project.supabase.co/auth/v1/.well-known/jwks.json",
    supabaseJwtIssuer: "https://project.supabase.co/auth/v1",
    ...overrides,
  };
}

export function accessContext(
  overrides: Partial<McpAccessContext> = {},
): McpAccessContext {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    clientId: "test-client",
    sessionId: "22222222-2222-4222-8222-222222222222",
    capabilities: new Set(["accounting.read"]),
    readOnly: false,
    ...overrides,
  };
}

export interface DatabaseMock extends DatabaseAccess {
  contextCalls: number;
  calls: Array<{ rpcName: string; request: unknown }>;
}

export function databaseMock(
  context: McpAccessContext,
  response: RpcEnvelope = { ok: true, data: { items: [] } },
): DatabaseMock {
  return {
    contextCalls: 0,
    calls: [],
    async getContext() {
      this.contextCalls += 1;
      return context;
    },
    async call(rpcName, request) {
      this.calls.push({ rpcName, request });
      return response;
    },
  };
}

export function databaseFactory(database: DatabaseAccess): DatabaseAccessFactory {
  return () => database;
}

export async function withHttpServer<T>(
  app: express.Express,
  callback: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeAllConnections();
    });
  }
}

export interface McpResponse {
  jsonrpc: "2.0";
  id?: number | string | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

export async function postMcp(
  baseUrl: string,
  body: object,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      Host: "mcp.quepia.test",
      Authorization: "Bearer test-token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
