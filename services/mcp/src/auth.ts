import type { Request } from "express";
import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { z } from "zod/v4";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import type { AuthIdentity } from "./types.js";

const claimsSchema = z.object({
  sub: z.uuid(),
  client_id: z.string().min(1).max(512),
  session_id: z.uuid(),
  aal: z.enum(["aal1", "aal2"]),
});

export type TokenVerifier = (token: string) => Promise<AuthIdentity>;

export function readBearerToken(request: Pick<Request, "headers">): string {
  const header = request.headers.authorization;
  if (typeof header !== "string") {
    throw new HttpError(401, "missing_token", "Bearer token required");
  }

  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match?.[1]) {
    throw new HttpError(401, "invalid_token", "Malformed Bearer token");
  }
  return match[1];
}

export function createTokenVerifier(
  config: AppConfig,
  keyResolver?: JWTVerifyGetKey,
): TokenVerifier {
  const resolveKey =
    keyResolver ??
    createRemoteJWKSet(new URL(config.supabaseJwksUrl), {
      timeoutDuration: Math.min(config.requestTimeoutMs, 5_000),
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });

  return async (token: string): Promise<AuthIdentity> => {
    try {
      const { payload } = await jwtVerify(token, resolveKey, {
        issuer: config.supabaseJwtIssuer,
        audience: config.resourceUri,
        algorithms: ["ES256", "RS256"],
        requiredClaims: [
          "exp",
          "sub",
          "client_id",
          "session_id",
          "aal",
          "aud",
        ],
        clockTolerance: 5,
      });
      if (payload.aud !== config.resourceUri) {
        throw new HttpError(
          401,
          "invalid_token",
          "Access token audience must exactly match the MCP resource",
        );
      }
      const claims = claimsSchema.parse(payload);
      return {
        subject: claims.sub,
        clientId: claims.client_id,
        sessionId: claims.session_id,
        aal: claims.aal,
        token,
      };
    } catch (error) {
      if (
        error instanceof joseErrors.JWTExpired ||
        error instanceof joseErrors.JWTClaimValidationFailed ||
        error instanceof joseErrors.JWSSignatureVerificationFailed ||
        error instanceof z.ZodError
      ) {
        throw new HttpError(401, "invalid_token", "Invalid access token");
      }
      throw new HttpError(
        401,
        "invalid_token",
        "Access token verification failed",
      );
    }
  };
}
