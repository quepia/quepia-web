import type { Request } from "express";
import {
  createRemoteJWKSet,
  decodeJwt,
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
  role: z.literal("mcp_authenticated"),
});

export type TokenVerifier = (token: string) => Promise<AuthIdentity>;

// Diagnóstico del rechazo de un token. El cliente sigue recibiendo un mensaje
// genérico —no se filtra qué claim falló—, pero el servidor registra la causa
// exacta: sin esto, seis fallas distintas comparten un único 401 mudo y cada
// intento de conexión obliga a adivinar en qué eslabón se rompió la cadena.
// Nunca se registra el token ni ningún valor secreto.
function describeTokenFailure(
  error: unknown,
  token: string,
  config: AppConfig,
): Record<string, unknown> {
  const diagnosis: Record<string, unknown> = {
    level: "warn",
    event: "mcp.token_rejected",
  };

  if (error instanceof joseErrors.JWTExpired) {
    diagnosis.reason = "token_expired";
  } else if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
    diagnosis.reason = "signature_invalid";
  } else if (error instanceof joseErrors.JWKSNoMatchingKey) {
    diagnosis.reason = "jwks_no_matching_key";
  } else if (error instanceof joseErrors.JWKSTimeout) {
    diagnosis.reason = "jwks_unreachable";
  } else if (error instanceof joseErrors.JWTClaimValidationFailed) {
    diagnosis.reason = "claim_invalid";
    diagnosis.claim = error.claim;
  } else if (error instanceof z.ZodError) {
    diagnosis.reason = "claim_shape_invalid";
    diagnosis.claims = error.issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
    }));
  } else if (error instanceof joseErrors.JWTInvalid) {
    diagnosis.reason = "token_malformed";
  } else {
    diagnosis.reason = "unknown";
  }

  // El payload sin verificar sólo sirve para el diagnóstico: si la firma ya
  // falló, estos valores no son de fiar, pero delatan al instante un `aud` o un
  // `role` que el hook de Supabase no llegó a escribir.
  try {
    const payload = decodeJwt(token) as Record<string, unknown>;
    diagnosis.observed = {
      aud: payload.aud ?? null,
      iss: payload.iss ?? null,
      role: payload.role ?? null,
      aal: payload.aal ?? null,
      hasClientId: Boolean(payload.client_id),
      hasSessionId: Boolean(payload.session_id),
    };
    diagnosis.expected = {
      aud: config.resourceUri,
      iss: config.supabaseJwtIssuer,
      role: "mcp_authenticated",
    };
  } catch {
    diagnosis.observed = "undecodable";
  }

  return diagnosis;
}

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
          "role",
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
      if (error instanceof HttpError) {
        console.warn(
          JSON.stringify({
            level: "warn",
            event: "mcp.token_rejected",
            reason: "audience_mismatch",
            expected: { aud: config.resourceUri },
          }),
        );
        throw error;
      }

      console.warn(JSON.stringify(describeTokenFailure(error, token, config)));

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
