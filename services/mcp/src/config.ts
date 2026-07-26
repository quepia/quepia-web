import { z } from "zod/v4";

const positiveInteger = z.coerce.number().int().positive();

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  MCP_RESOURCE_URI: z.url(),
  MCP_APPROVAL_BASE_URL: z.url(),
  MCP_ALLOWED_ORIGINS: z.string().default(""),
  MCP_ALLOWED_HOSTS: z.string().default(""),
  MCP_PROTOCOL_VERSIONS: z
    .string()
    .default("2025-11-25,2025-06-18,2025-03-26"),
  MCP_OAUTH_SCOPES: z.string().default("openid"),
  MCP_REQUEST_BODY_LIMIT_BYTES: positiveInteger.default(65_536),
  MCP_REQUEST_TIMEOUT_MS: positiveInteger.default(15_000),
  MCP_DB_TIMEOUT_MS: positiveInteger.default(8_000),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: z.url().optional(),
  SUPABASE_JWT_ISSUER: z.url().optional(),
});

export interface AppConfig {
  environment: "development" | "test" | "production";
  host: string;
  port: number;
  resourceUri: string;
  resourceMetadataUri: string;
  approvalBaseUrl: string;
  allowedOrigins: ReadonlySet<string>;
  allowedHosts: ReadonlySet<string>;
  protocolVersions: ReadonlySet<string>;
  oauthScopes: readonly string[];
  requestBodyLimitBytes: number;
  requestTimeoutMs: number;
  databaseTimeoutMs: number;
  supabaseUrl: string;
  supabasePublishableKey: string;
  supabaseJwksUrl: string;
  supabaseJwtIssuer: string;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function assertNoUrlCredentials(name: string, value: URL): void {
  if (value.username || value.password) {
    throw new Error(`${name} must not contain username or password`);
  }
}

function normalizeOrigin(value: string): string {
  const origin = new URL(value);
  assertNoUrlCredentials("MCP_ALLOWED_ORIGINS", origin);
  return origin.origin;
}

function decodeBase64UrlJson(segment: string): unknown {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return JSON.parse(atob(normalized + "=".repeat(paddingLength))) as unknown;
}

function assertPublishableKey(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY must be a publishable key");
  }

  const parts = key.split(".");
  if (parts.length !== 3) {
    if (!key.startsWith("sb_publishable_")) {
      throw new Error(
        "SUPABASE_PUBLISHABLE_KEY must be an sb_publishable_ key or a legacy anon JWT",
      );
    }
    return;
  }

  try {
    const payload = decodeBase64UrlJson(parts[1] ?? "") as {
      role?: unknown;
    };
    if (payload.role !== "anon") {
      throw new Error(
        "SUPABASE_PUBLISHABLE_KEY legacy JWT must carry the anon role",
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("must carry the anon role")
    ) {
      throw error;
    }
    throw new Error("SUPABASE_PUBLISHABLE_KEY is not a valid public API key");
  }
}

function metadataUriFor(resourceUri: URL): string {
  const suffix =
    resourceUri.pathname === "/"
      ? ""
      : resourceUri.pathname.replace(/\/+$/, "");
  return `${resourceUri.origin}/.well-known/oauth-protected-resource${suffix}`;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.parse(environment);
  assertPublishableKey(parsed.SUPABASE_PUBLISHABLE_KEY);

  const resource = new URL(parsed.MCP_RESOURCE_URI);
  const approvalBase = new URL(parsed.MCP_APPROVAL_BASE_URL);
  assertNoUrlCredentials("MCP_RESOURCE_URI", resource);
  assertNoUrlCredentials("MCP_APPROVAL_BASE_URL", approvalBase);
  if (
    parsed.NODE_ENV === "production" &&
    resource.protocol !== "https:"
  ) {
    throw new Error("MCP_RESOURCE_URI must use HTTPS in production");
  }
  resource.hash = "";
  resource.search = "";
  resource.pathname =
    resource.pathname === "/" ? "/mcp" : resource.pathname.replace(/\/+$/, "");
  if (resource.pathname !== "/mcp") {
    throw new Error("MCP_RESOURCE_URI must identify the /mcp endpoint");
  }
  if (
    approvalBase.pathname !== "/" ||
    approvalBase.search ||
    approvalBase.hash
  ) {
    throw new Error(
      "MCP_APPROVAL_BASE_URL must be an origin without a path, query, or fragment",
    );
  }
  if (
    parsed.NODE_ENV === "production" &&
    approvalBase.protocol !== "https:"
  ) {
    throw new Error("MCP_APPROVAL_BASE_URL must use HTTPS in production");
  }

  const resourceUri = resource.toString();
  const allowedOrigins = new Set(
    parseCsv(parsed.MCP_ALLOWED_ORIGINS).map(normalizeOrigin),
  );
  const configuredHosts = parseCsv(parsed.MCP_ALLOWED_HOSTS).map((host) =>
    host.toLowerCase(),
  );
  const allowedHosts = new Set(
    configuredHosts.length > 0
      ? configuredHosts
      : [resource.host.toLowerCase()],
  );
  const protocolVersions = new Set(parseCsv(parsed.MCP_PROTOCOL_VERSIONS));
  if (!protocolVersions.has("2025-11-25")) {
    throw new Error("MCP_PROTOCOL_VERSIONS must include 2025-11-25");
  }
  if (!protocolVersions.has("2025-03-26")) {
    throw new Error(
      "MCP_PROTOCOL_VERSIONS must include the 2025-03-26 fallback",
    );
  }

  const supabaseUrl = withoutTrailingSlash(parsed.SUPABASE_URL);
  const supabaseJwksUrl =
    parsed.SUPABASE_JWKS_URL ??
    `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const supabaseJwtIssuer =
    parsed.SUPABASE_JWT_ISSUER ?? `${supabaseUrl}/auth/v1`;
  for (const [name, value] of [
    ["SUPABASE_URL", supabaseUrl],
    ["SUPABASE_JWKS_URL", supabaseJwksUrl],
    ["SUPABASE_JWT_ISSUER", supabaseJwtIssuer],
  ] as const) {
    assertNoUrlCredentials(name, new URL(value));
  }
  if (parsed.NODE_ENV === "production") {
    for (const [name, value] of [
      ["SUPABASE_URL", supabaseUrl],
      ["SUPABASE_JWKS_URL", supabaseJwksUrl],
      ["SUPABASE_JWT_ISSUER", supabaseJwtIssuer],
    ] as const) {
      if (new URL(value).protocol !== "https:") {
        throw new Error(`${name} must use HTTPS in production`);
      }
    }
  }
  return {
    environment: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    resourceUri,
    resourceMetadataUri: metadataUriFor(resource),
    approvalBaseUrl: approvalBase.origin,
    allowedOrigins,
    allowedHosts,
    protocolVersions,
    oauthScopes: parsed.MCP_OAUTH_SCOPES.split(/\s+/).filter(Boolean),
    requestBodyLimitBytes: parsed.MCP_REQUEST_BODY_LIMIT_BYTES,
    requestTimeoutMs: parsed.MCP_REQUEST_TIMEOUT_MS,
    databaseTimeoutMs: parsed.MCP_DB_TIMEOUT_MS,
    supabaseUrl,
    supabasePublishableKey: parsed.SUPABASE_PUBLISHABLE_KEY,
    supabaseJwksUrl,
    supabaseJwtIssuer,
  };
}
