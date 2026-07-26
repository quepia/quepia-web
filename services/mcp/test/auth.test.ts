import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from "jose";
import { describe, expect, it } from "vitest";
import { createTokenVerifier } from "../src/auth.js";
import { testConfig } from "./helpers.js";

const subject = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

async function keyMaterial() {
  const pair = await generateKeyPair("ES256");
  const publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = "test-key";
  publicJwk.alg = "ES256";
  return {
    privateKey: pair.privateKey,
    resolver: createLocalJWKSet({ keys: [publicJwk] }),
  };
}

async function token(
  privateKey: CryptoKey,
  audience: string | string[] = "https://mcp.quepia.test/mcp",
): Promise<string> {
  return new SignJWT({
    client_id: "test-client",
    session_id: sessionId,
    aal: "aal1",
  })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setIssuer("https://project.supabase.co/auth/v1")
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("Supabase OAuth JWT verification", () => {
  it("accepts a correctly signed token with the canonical MCP audience", async () => {
    const keys = await keyMaterial();
    const verifier = createTokenVerifier(testConfig(), keys.resolver);
    const identity = await verifier(await token(keys.privateKey));

    expect(identity).toMatchObject({
      subject,
      clientId: "test-client",
      sessionId,
      aal: "aal1",
    });
  });

  it("rejects a token issued for another audience", async () => {
    const keys = await keyMaterial();
    const verifier = createTokenVerifier(testConfig(), keys.resolver);

    await expect(
      verifier(await token(keys.privateKey, "https://other.example/mcp")),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_token",
    });
  });

  it("rejects a multi-audience token instead of accepting partial membership", async () => {
    const keys = await keyMaterial();
    const verifier = createTokenVerifier(testConfig(), keys.resolver);

    await expect(
      verifier(
        await token(keys.privateKey, [
          "https://mcp.quepia.test/mcp",
          "https://other.example/mcp",
        ]),
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_token",
    });
  });

  it("rejects a token with an invalid signature", async () => {
    const trusted = await keyMaterial();
    const attacker = await keyMaterial();
    const verifier = createTokenVerifier(testConfig(), trusted.resolver);

    await expect(
      verifier(await token(attacker.privateKey)),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_token",
    });
  });
});
