import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const requiredEnvironment = {
  NODE_ENV: "test",
  MCP_RESOURCE_URI: "https://mcp.entrypoint.test/mcp",
  MCP_APPROVAL_BASE_URL: "https://app.entrypoint.test",
  MCP_ALLOWED_HOSTS: "127.0.0.1",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_entrypoint_test",
} as const;

describe("Vercel Express entrypoint", () => {
  const previousEnvironment = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const [key, value] of Object.entries(requiredEnvironment)) {
      previousEnvironment.set(key, process.env[key]);
      process.env[key] = value;
    }
  });

  afterAll(() => {
    for (const [key, value] of previousEnvironment) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("default-exports an Express request listener without binding a port", async () => {
    const entrypoint = await import("../src/index.js");
    expect(entrypoint.default).toBeTypeOf("function");
    expect(entrypoint.default).toHaveProperty("listen");

    const server = createServer(entrypoint.default);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        service: "quepia-business-control-mcp",
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    }
  });
});
