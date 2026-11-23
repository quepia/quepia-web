import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";
import type { AppConfig } from "./config.js";
import { HttpError } from "./errors.js";
import type {
  AuthIdentity,
  DatabaseAccess,
  DatabaseAccessFactory,
  McpAccessContext,
  RpcEnvelope,
  SocialPublishingAction,
} from "./types.js";

const rpcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
});

const rpcEnvelopeSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: rpcErrorSchema.nullish(),
});

const contextDataSchema = z.object({
  user_id: z.uuid(),
  client_id: z.string().min(1),
  session_id: z.uuid(),
  capabilities: z.array(z.string().min(1)).max(100),
  read_only: z.boolean().default(false),
  grant_expires_at: z.iso.datetime().nullish(),
});

function createUserClient(
  config: AppConfig,
  accessToken: string,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function invokeRpc(
  client: SupabaseClient,
  rpcName: string,
  request: unknown,
  timeoutMs: number,
): Promise<RpcEnvelope> {
  const signal = AbortSignal.timeout(timeoutMs);
  const { data, error } = await client
    .rpc(rpcName, { p_request: request })
    .abortSignal(signal);

  if (error) {
    // PostgREST explica en `code`/`hint` si rechazó el rol, el pre-request o
    // los permisos de ejecución, y descartar ese detalle dejaba un 502 idéntico
    // para causas que no tienen nada que ver entre sí.
    console.error(
      JSON.stringify({
        level: "error",
        event: "mcp.rpc_failed",
        rpc: rpcName,
        code: error.code ?? null,
        message: error.message ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      }),
    );
    throw new HttpError(
      502,
      "database_rpc_failed",
      `Database RPC ${rpcName} failed`,
    );
  }
  const parsed = rpcEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    throw new HttpError(
      502,
      "invalid_rpc_response",
      `Database RPC ${rpcName} returned an invalid envelope`,
    );
  }
  return parsed.data;
}

interface WebErrorMessages {
  service: string;
  timeoutCode: string;
  timeout: string;
  unreachableCode: string;
  unreachable: string;
  invalidCode: string;
}

const INVOICE_ERRORS: WebErrorMessages = {
  service: "The invoicing service",
  timeoutCode: "invoice_timeout",
  timeout:
    "The voucher is still being processed. Repeat the same call to get its result; it never issues twice.",
  unreachableCode: "invoice_service_unreachable",
  unreachable: "The invoicing service could not be reached.",
  invalidCode: "invalid_invoice_response",
};

const SOCIAL_PUBLISHING_ERRORS: WebErrorMessages = {
  service: "The social publishing service",
  timeoutCode: "publishing_timeout",
  timeout:
    "The request is still running on the server (media preparation can take minutes). Check social_list_publications, or repeat social_publish_task with the same idempotency_key: it never creates a second post.",
  unreachableCode: "publishing_service_unreachable",
  unreachable: "The social publishing service could not be reached.",
  invalidCode: "invalid_publishing_response",
};

class SupabaseDatabaseAccess implements DatabaseAccess {
  private readonly client: SupabaseClient;

  constructor(
    private readonly config: AppConfig,
    private readonly identity: AuthIdentity,
  ) {
    this.client = createUserClient(config, identity.token);
  }

  async getContext(): Promise<McpAccessContext> {
    const envelope = await invokeRpc(
      this.client,
      "mcp_get_context",
      {},
      this.config.databaseTimeoutMs,
    );
    return accessContextFromEnvelope(envelope, this.identity);
  }

  call(rpcName: string, request: unknown): Promise<RpcEnvelope> {
    return invokeRpc(
      this.client,
      rpcName,
      request,
      this.config.databaseTimeoutMs,
    );
  }

  issueInvoice(request: unknown): Promise<RpcEnvelope> {
    return this.postToWeb("/api/invoicing/mcp", request, INVOICE_ERRORS);
  }

  issueCreditNote(request: unknown): Promise<RpcEnvelope> {
    return this.postToWeb(
      "/api/invoicing/mcp/credit-note",
      request,
      INVOICE_ERRORS,
    );
  }

  socialPublishing(
    action: SocialPublishingAction,
    request: unknown,
  ): Promise<RpcEnvelope> {
    return this.postToWeb(
      `/api/social/mcp/${action}`,
      request,
      SOCIAL_PUBLISHING_ERRORS,
    );
  }

  private async postToWeb(
    path: string,
    request: unknown,
    errors: WebErrorMessages,
  ): Promise<RpcEnvelope> {
    // Deja un segundo para responder antes del límite del pedido MCP. Si se
    // corta igual, la web termina la emisión y repetir el pedido devuelve ese
    // mismo comprobante: la emisión es idempotente.
    const timeoutMs = Math.max(this.config.requestTimeoutMs - 1_000, 1_000);
    let response: Response;
    try {
      response = await fetch(new URL(path, this.config.webBaseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.identity.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException && error.name === "TimeoutError";
      throw new HttpError(
        504,
        timedOut ? errors.timeoutCode : errors.unreachableCode,
        timedOut ? errors.timeout : errors.unreachable,
      );
    }

    const parsed = rpcEnvelopeSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new HttpError(
        502,
        errors.invalidCode,
        `${errors.service} answered ${response.status} without a valid envelope`,
      );
    }
    return parsed.data;
  }
}

export function accessContextFromEnvelope(
  envelope: RpcEnvelope,
  identity: AuthIdentity,
): McpAccessContext {
  if (!envelope.ok) {
    throw new HttpError(
      403,
      envelope.error?.code ?? "access_denied",
      envelope.error?.message ?? "MCP access denied",
    );
  }

  const parsed = contextDataSchema.safeParse(envelope.data);
  if (!parsed.success) {
    throw new HttpError(
      502,
      "invalid_context",
      "mcp_get_context returned invalid data",
    );
  }
  if (
    parsed.data.user_id !== identity.subject ||
    parsed.data.client_id !== identity.clientId ||
    parsed.data.session_id !== identity.sessionId
  ) {
    throw new HttpError(
      403,
      "context_mismatch",
      "MCP access context does not match the authenticated token",
    );
  }
  if (
    parsed.data.grant_expires_at &&
    Date.parse(parsed.data.grant_expires_at) <= Date.now()
  ) {
    throw new HttpError(403, "grant_expired", "MCP access grant expired");
  }

  const context: McpAccessContext = {
    userId: parsed.data.user_id,
    clientId: parsed.data.client_id,
    sessionId: parsed.data.session_id,
    capabilities: new Set(parsed.data.capabilities),
    readOnly: parsed.data.read_only,
  };
  if (parsed.data.grant_expires_at) {
    context.grantExpiresAt = parsed.data.grant_expires_at;
  }
  return context;
}

export function createDatabaseAccessFactory(
  config: AppConfig,
): DatabaseAccessFactory {
  return (identity) => new SupabaseDatabaseAccess(config, identity);
}
