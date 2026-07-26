import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

function legacyKey(role: string): string {
  return [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(JSON.stringify({ role })).toString("base64url"),
    "signature",
  ].join(".");
}

function environment(key: string): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MCP_RESOURCE_URI: "https://mcp.quepia.test/mcp",
    MCP_APPROVAL_BASE_URL: "https://app.quepia.test",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: key,
  };
}

describe("configuration", () => {
  it("accepts publishable and legacy anon API keys", () => {
    expect(
      loadConfig(environment("sb_publishable_example")).supabasePublishableKey,
    ).toBe("sb_publishable_example");
    expect(loadConfig(environment(legacyKey("anon"))).supabasePublishableKey).toBe(
      legacyKey("anon"),
    );
  });

  it("rejects privileged Supabase keys", () => {
    expect(() => loadConfig(environment("sb_secret_example"))).toThrow(
      "must be a publishable key",
    );
    expect(() => loadConfig(environment(legacyKey("service_role")))).toThrow(
      "must carry the anon role",
    );
  });

  it("requires a pathless trusted approval origin", () => {
    expect(() =>
      loadConfig({
        ...environment("sb_publishable_example"),
        MCP_APPROVAL_BASE_URL: "https://app.quepia.test/untrusted/path",
      }),
    ).toThrow("must be an origin");
    expect(() =>
      loadConfig({
        ...environment("sb_publishable_example"),
        NODE_ENV: "production",
        MCP_APPROVAL_BASE_URL: "http://app.quepia.test",
      }),
    ).toThrow("must use HTTPS");
  });

  it("rejects credentials embedded in trusted URLs", () => {
    expect(() =>
      loadConfig({
        ...environment("sb_publishable_example"),
        MCP_RESOURCE_URI: "https://user:password@mcp.quepia.test/mcp",
      }),
    ).toThrow("MCP_RESOURCE_URI must not contain username or password");
    expect(() =>
      loadConfig({
        ...environment("sb_publishable_example"),
        MCP_APPROVAL_BASE_URL: "https://user:password@app.quepia.test",
      }),
    ).toThrow("MCP_APPROVAL_BASE_URL must not contain username or password");
  });
});
