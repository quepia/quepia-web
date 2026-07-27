import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/http-app.js";
import type { TokenVerifier } from "../src/auth.js";
import { HttpError } from "../src/errors.js";
import {
  accessContext,
  databaseFactory,
  databaseMock,
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

function initializeRequest() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    },
  };
}

describe("HTTP security and discovery", () => {
  it("publishes protected-resource metadata at root and MCP path", async () => {
    const config = testConfig();
    const database = databaseMock(accessContext());
    const app = createApp({
      config,
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      for (const path of [
        "/.well-known/oauth-protected-resource",
        "/.well-known/oauth-protected-resource/mcp",
      ]) {
        const response = await fetch(`${baseUrl}${path}`, {
          headers: { Host: "mcp.quepia.test" },
        });
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
          resource: config.resourceUri,
          authorization_servers: ["https://project.supabase.co/auth/v1"],
          bearer_methods_supported: ["header"],
        });
      }
    });
  });

  it("returns a discoverable Bearer challenge when authorization is missing", async () => {
    const config = testConfig();
    const database = databaseMock(accessContext());
    const app = createApp({
      config,
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, initializeRequest(), {
        Authorization: "",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain(
        `resource_metadata="${config.resourceMetadataUri}"`,
      );
    });
  });

  it("rejects a supplied non-allowlisted Origin", async () => {
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(databaseMock(accessContext())),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, initializeRequest(), {
        Origin: "https://evil.example",
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("www-authenticate")).toBeNull();

      const credentialed = await postMcp(baseUrl, initializeRequest(), {
        Origin: "https://user:password@app.quepia.test",
      });
      expect(credentialed.status).toBe(403);
      expect(credentialed.headers.get("www-authenticate")).toBeNull();
    });
  });

  it("allows no Origin for non-browser clients and an allowlisted Origin", async () => {
    const database = databaseMock(accessContext());
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const noOrigin = await postMcp(baseUrl, initializeRequest());
      expect(noOrigin.status).toBe(200);
        await expect(noOrigin.json()).resolves.toMatchObject({
        result: {
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          instructions: expect.stringContaining(
            "Never call commit until accounting_get_operation reports the operation as approved",
          ),
        },
      });

      const allowed = await postMcp(baseUrl, initializeRequest(), {
        Origin: "https://app.quepia.test",
      });
      expect(allowed.status).toBe(200);
      expect(database.contextCalls).toBe(2);
    });
  });

  it("answers the browser preflight for an allowlisted Origin", async () => {
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(databaseMock(accessContext())),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "OPTIONS",
        headers: {
          Host: "mcp.quepia.test",
          Origin: "https://app.quepia.test",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "authorization,content-type,mcp-protocol-version",
        },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://app.quepia.test",
      );
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "POST",
      );
      const allowedHeaders =
        response.headers.get("access-control-allow-headers")?.toLowerCase() ??
        "";
      for (const header of [
        "authorization",
        "content-type",
        "mcp-protocol-version",
      ]) {
        expect(allowedHeaders).toContain(header);
      }
      expect(response.headers.get("vary")?.toLowerCase()).toContain("origin");
    });
  });

  it("denies the browser preflight for a non-allowlisted Origin", async () => {
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(databaseMock(accessContext())),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/mcp`, {
        method: "OPTIONS",
        headers: {
          Host: "mcp.quepia.test",
          Origin: "https://evil.example",
          "Access-Control-Request-Method": "POST",
        },
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  it("exposes the Bearer challenge to an allowlisted browser Origin", async () => {
    const config = testConfig();
    const app = createApp({
      config,
      tokenVerifier,
      databaseFactory: databaseFactory(databaseMock(accessContext())),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, initializeRequest(), {
        Origin: "https://app.quepia.test",
        Authorization: "",
      });
      expect(response.status).toBe(401);
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "https://app.quepia.test",
      );
      expect(
        response.headers.get("access-control-expose-headers")?.toLowerCase(),
      ).toContain("www-authenticate");
    });
  });

  it("uses only registered Bearer error codes in authentication challenges", async () => {
    const config = testConfig();
    const database = databaseMock(accessContext());
    const invalidTokenVerifier: TokenVerifier = vi.fn(async () => {
      throw new HttpError(401, "invalid_token", "Invalid access token");
    });
    const app = createApp({
      config,
      tokenVerifier: invalidTokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const missing = await postMcp(baseUrl, initializeRequest(), {
        Authorization: "",
      });
      expect(missing.headers.get("www-authenticate")).not.toContain(
        'error="missing_token"',
      );

      const invalid = await postMcp(baseUrl, initializeRequest());
      expect(invalid.headers.get("www-authenticate")).toContain(
        'error="invalid_token"',
      );
      expect(invalid.headers.get("www-authenticate")).not.toContain(
        'error="internal_error"',
      );
    });

    const deniedApp = createApp({
      config,
      tokenVerifier,
      databaseFactory: () => ({
        async getContext() {
          throw new HttpError(
            403,
            "missing_capability",
            "Capability not granted",
          );
        },
        async call() {
          throw new Error("unreachable");
        },
      }),
    });
    await withHttpServer(deniedApp, async (baseUrl) => {
      const denied = await postMcp(baseUrl, initializeRequest());
      expect(denied.headers.get("www-authenticate")).toContain(
        'error="insufficient_scope"',
      );
      expect(denied.headers.get("www-authenticate")).not.toContain(
        "missing_capability",
      );
    });
  });

  it("rejects an oversized declared body before database authorization", async () => {
    const database = databaseMock(accessContext());
    const app = createApp({
      config: testConfig({ requestBodyLimitBytes: 256 }),
      tokenVerifier,
      databaseFactory: databaseFactory(database),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, {
        ...initializeRequest(),
        padding: "x".repeat(500),
      });
      expect(response.status).toBe(413);
      expect(database.contextCalls).toBe(0);
    });
  });

  it("rejects unsupported protocol versions", async () => {
    const app = createApp({
      config: testConfig(),
      tokenVerifier,
      databaseFactory: databaseFactory(databaseMock(accessContext())),
    });

    await withHttpServer(app, async (baseUrl) => {
      const response = await postMcp(baseUrl, initializeRequest(), {
        "MCP-Protocol-Version": "2099-01-01",
      });
      expect(response.status).toBe(400);
    });
  });
});
