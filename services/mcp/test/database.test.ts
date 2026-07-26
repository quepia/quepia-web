import { describe, expect, it } from "vitest";
import { accessContextFromEnvelope } from "../src/database.js";
import type { AuthIdentity, RpcEnvelope } from "../src/types.js";

const identity: AuthIdentity = {
  subject: "11111111-1111-4111-8111-111111111111",
  clientId: "test-client",
  sessionId: "22222222-2222-4222-8222-222222222222",
  aal: "aal1",
  token: "not-persisted",
};

function contextEnvelope(
  overrides: Record<string, unknown> = {},
): RpcEnvelope {
  return {
    ok: true,
    data: {
      user_id: identity.subject,
      client_id: identity.clientId,
      session_id: identity.sessionId,
      capabilities: ["accounting.read"],
      read_only: false,
      ...overrides,
    },
  };
}

describe("fresh database access context", () => {
  it("accepts matching token-bound identity and capabilities", () => {
    const context = accessContextFromEnvelope(contextEnvelope(), identity);
    expect(context).toMatchObject({
      userId: identity.subject,
      clientId: identity.clientId,
      sessionId: identity.sessionId,
      readOnly: false,
    });
    expect(context.capabilities).toEqual(new Set(["accounting.read"]));
  });

  it.each([
    ["user_id", "99999999-9999-4999-8999-999999999999"],
    ["client_id", "another-client"],
    ["session_id", "88888888-8888-4888-8888-888888888888"],
  ])("rejects a mismatched %s", (claim, value) => {
    expect(() =>
      accessContextFromEnvelope(contextEnvelope({ [claim]: value }), identity),
    ).toThrow("does not match");
  });

  it("rejects an expired grant even when the RPC envelope says ok", () => {
    expect(() =>
      accessContextFromEnvelope(
        contextEnvelope({ grant_expires_at: "2020-01-01T00:00:00Z" }),
        identity,
      ),
    ).toThrow("grant expired");
  });
});
