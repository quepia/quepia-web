import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import type { AppConfig } from "./config.js";
import { HttpError, errorMessage } from "./errors.js";
import { readBearerToken, type TokenVerifier } from "./auth.js";
import { createMcpServer } from "./tools.js";
import type {
  AuthIdentity,
  DatabaseAccess,
  DatabaseAccessFactory,
  McpAccessContext,
} from "./types.js";

interface RequestSecurityContext {
  identity: AuthIdentity;
  database: DatabaseAccess;
  access: McpAccessContext;
}

declare global {
  namespace Express {
    interface Request {
      securityContext?: RequestSecurityContext;
      requestId?: string;
    }
  }
}

function jsonRpcError(message: string, code = -32_000): object {
  return {
    jsonrpc: "2.0",
    error: { code, message },
    id: null,
  };
}

function metadata(config: AppConfig): object {
  return {
    resource: config.resourceUri,
    authorization_servers: [`${config.supabaseUrl}/auth/v1`],
    bearer_methods_supported: ["header"],
    scopes_supported: config.oauthScopes,
    resource_name: "Quepia Business Control MCP",
  };
}

function bearerChallenge(
  config: AppConfig,
  errorCode?: string,
): string {
  const parameters = [
    `resource_metadata="${config.resourceMetadataUri}"`,
  ];
  if (config.oauthScopes.length > 0) {
    parameters.push(`scope="${config.oauthScopes.join(" ")}"`);
  }
  if (errorCode) {
    parameters.push(`error="${errorCode}"`);
  }
  return `Bearer ${parameters.join(", ")}`;
}

function validateHost(config: AppConfig, request: Request): void {
  const host = request.headers.host?.toLowerCase();
  let hostname: string | undefined;
  try {
    const parsed = host ? new URL(`http://${host}`) : undefined;
    if (
      !parsed ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("Malformed Host");
    }
    hostname = parsed.hostname.toLowerCase();
  } catch {
    hostname = undefined;
  }
  if (
    !host ||
    !hostname ||
    (!config.allowedHosts.has(host) && !config.allowedHosts.has(hostname))
  ) {
    throw new HttpError(400, "invalid_host", "Invalid Host header");
  }
}

function validateOrigin(config: AppConfig, request: Request): void {
  const origin = request.headers.origin;
  if (origin === undefined) {
    return;
  }
  let normalized: string;
  try {
    const parsed = new URL(origin);
    if (parsed.username || parsed.password) {
      throw new Error("Origin contains credentials");
    }
    normalized = parsed.origin;
  } catch {
    throw new HttpError(403, "invalid_origin", "Origin is not allowed");
  }
  if (!config.allowedOrigins.has(normalized)) {
    throw new HttpError(403, "invalid_origin", "Origin is not allowed");
  }
}

function validateProtocolVersion(config: AppConfig, request: Request): void {
  const version = request.header("MCP-Protocol-Version");
  if (version && !config.protocolVersions.has(version)) {
    throw new HttpError(
      400,
      "unsupported_protocol_version",
      `Unsupported MCP protocol version. Supported versions: ${[
        ...config.protocolVersions,
      ].join(", ")}`,
    );
  }
}

function validateContentLength(config: AppConfig, request: Request): void {
  const contentLength = request.headers["content-length"];
  if (contentLength === undefined) {
    return;
  }
  if (!/^\d+$/.test(contentLength)) {
    throw new HttpError(
      400,
      "invalid_content_length",
      "Invalid Content-Length header",
    );
  }
  if (Number(contentLength) > config.requestBodyLimitBytes) {
    throw new HttpError(413, "request_too_large", "Request body too large");
  }
}

function securityMiddleware(config: AppConfig) {
  return (request: Request, response: Response, next: NextFunction): void => {
    try {
      request.requestId = randomUUID();
      validateHost(config, request);
      validateOrigin(config, request);
      validateProtocolVersion(config, request);
      validateContentLength(config, request);
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("MCP-Protocol-Version", "2025-11-25");
      request.setTimeout(config.requestTimeoutMs);
      response.setTimeout(config.requestTimeoutMs, () => {
        if (!response.headersSent) {
          response
            .status(504)
            .json(jsonRpcError("Request timed out", -32_001));
        } else {
          response.end();
        }
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

function authenticateMcpRequest(
  tokenVerifier: TokenVerifier,
  databaseFactory: DatabaseAccessFactory,
) {
  return async (
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const token = readBearerToken(request);
      const identity = await tokenVerifier(token);
      const database = databaseFactory(identity);
      const access = await database.getContext();
      request.securityContext = { identity, database, access };
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireSecurityContext(request: Request): RequestSecurityContext {
  if (!request.securityContext) {
    throw new HttpError(
      500,
      "security_context_missing",
      "Security context is unavailable",
    );
  }
  return request.securityContext;
}

export interface AppDependencies {
  config: AppConfig;
  tokenVerifier: TokenVerifier;
  databaseFactory: DatabaseAccessFactory;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const { config, tokenVerifier, databaseFactory } = dependencies;
  const app = express();
  app.disable("x-powered-by");

  app.use(securityMiddleware(config));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "quepia-business-control-mcp",
      version: "0.1.0",
    });
  });

  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    (_request, response) => {
      response.json(metadata(config));
    },
  );

  const authentication = authenticateMcpRequest(
    tokenVerifier,
    databaseFactory,
  );
  app.use("/mcp", authentication);
  app.use(
    "/mcp",
    express.json({
      limit: config.requestBodyLimitBytes,
      type: ["application/json", "application/*+json"],
    }),
  );

  app.post("/mcp", async (request, response, next) => {
    const security = requireSecurityContext(request);
    const server = createMcpServer(
      security.access,
      security.database,
      config.approvalBaseUrl,
    );
    const transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
    });

    let closed = false;
    const close = (): void => {
      if (closed) return;
      closed = true;
      void transport.close();
      void server.close();
    };
    response.once("close", close);

    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      close();
      next(error);
    }
  });

  app.get("/mcp", (_request, response) => {
    response
      .status(405)
      .set("Allow", "POST")
      .json(jsonRpcError("Standalone SSE is not supported"));
  });

  app.delete("/mcp", (_request, response) => {
    response
      .status(405)
      .set("Allow", "POST")
      .json(jsonRpcError("Stateless transport has no session to delete"));
  });

  app.use((_request, response) => {
    response.status(404).json({ ok: false, error: "Not found" });
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    if (response.headersSent) {
      response.end();
      return;
    }

    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json(jsonRpcError("Invalid JSON", -32_700));
      return;
    }
    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.too.large"
    ) {
      response.status(413).json(jsonRpcError("Request body too large"));
      return;
    }

    const httpError =
      error instanceof HttpError
        ? error
        : new HttpError(500, "internal_error", "Internal server error");
    if (httpError.status === 401 || httpError.status === 403) {
      response.setHeader(
        "WWW-Authenticate",
        bearerChallenge(config, httpError.code),
      );
    }
    if (httpError.status >= 500) {
      console.error(
        JSON.stringify({
          level: "error",
          code: httpError.code,
          message: errorMessage(httpError),
        }),
      );
    }
    response
      .status(httpError.status)
      .json(jsonRpcError(httpError.message));
  };
  app.use(errorHandler);

  return app;
}
