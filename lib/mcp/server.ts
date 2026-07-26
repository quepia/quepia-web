import "server-only"

import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/sistema/supabase/server"
import {
  operationCanBeApproved,
  operationIsExpired,
  parseMcpApprovalChallenge,
  parseMcpApprovalResult,
  parseMcpExpenseOperation,
  parseMcpRpcEnvelope,
  type McpApprovalResult,
  type McpExpenseOperation,
} from "@/lib/mcp/contracts"
import {
  mapSupabaseMcpError,
  McpWebError,
} from "@/lib/mcp/errors"
import { isDirectFirstPartySessionClaims } from "@/lib/mcp/session-boundary"

type SistemaServerClient = Awaited<ReturnType<typeof createClient>>
export type McpAuthenticatorLevel = "aal1" | "aal2" | null

export interface McpWebSession {
  supabase: SistemaServerClient
  user: User
  aal: McpAuthenticatorLevel
}

export async function getMcpWebSession(): Promise<McpWebSession> {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    throw new McpWebError(
      "UNAUTHENTICATED",
      "Necesitás iniciar sesión.",
      401,
    )
  }

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims()
  if (
    claimsError ||
    !isDirectFirstPartySessionClaims(claimsData?.claims)
  ) {
    throw new McpWebError(
      "FORBIDDEN",
      "Los tokens de clientes OAuth no son sesiones web válidas.",
      403,
    )
  }

  const { data: aalData, error: aalError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const currentAal = aalData?.currentLevel
  let aal: McpAuthenticatorLevel = null
  if (!aalError && currentAal === "aal1") {
    aal = "aal1"
  } else if (!aalError && currentAal === "aal2") {
    aal = "aal2"
  }

  return {
    supabase,
    user,
    aal,
  }
}

export async function getMcpExpenseOperation(
  supabase: SistemaServerClient,
  operationId: string,
): Promise<McpExpenseOperation> {
  const { data, error } = await supabase.rpc("mcp_accounting_get_operation", {
    p_request: { operation_id: operationId },
  })

  if (error) {
    throw mapSupabaseMcpError(error)
  }

  try {
    const envelope = parseMcpRpcEnvelope(data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }

    const operation = parseMcpExpenseOperation(envelope.data)
    if (operation.operationId !== operationId) {
      throw new Error("OPERATION_ID_MISMATCH")
    }
    return operation
  } catch (parseError) {
    if (parseError instanceof McpWebError) {
      throw parseError
    }
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El control plane devolvió una operación inválida.",
      502,
    )
  }
}

export interface ApproveMcpExpenseInput {
  operation: McpExpenseOperation
  viewedPayloadHash: string
}

export async function approveMcpExpense(
  session: McpWebSession,
  { operation, viewedPayloadHash }: ApproveMcpExpenseInput,
): Promise<McpApprovalResult> {
  if (viewedPayloadHash !== operation.payloadHash) {
    throw new McpWebError(
      "PAYLOAD_MISMATCH",
      "La vista revisada no coincide con la operación vigente.",
      409,
    )
  }

  if (operationIsExpired(operation)) {
    throw new McpWebError("EXPIRED", "La operación expiró.", 409)
  }

  if (operation.status === "approved") {
    throw new McpWebError(
      "ALREADY_APPROVED",
      "La operación ya fue aprobada.",
      409,
    )
  }

  if (!operationCanBeApproved(operation)) {
    throw new McpWebError(
      "NOT_APPROVABLE",
      "El estado actual no permite aprobar la operación.",
      409,
    )
  }

  // El MVP financiero exige AAL2 para toda aprobación humana. El dato
  // requiresAal2 se conserva para validar el contrato, pero nunca relaja esta
  // regla en operaciones de gasto.
  if (session.aal !== "aal2") {
    throw new McpWebError(
      "AAL2_REQUIRED",
      "Esta aprobación requiere autenticación multifactor.",
      403,
    )
  }

  // La base emite el challenge de un solo uso y guarda únicamente su hash. El
  // nonce crudo vive solo durante este POST y nunca vuelve al navegador/MCP.
  const challengeResponse = await session.supabase.rpc(
    "mcp_accounting_get_operation",
    {
      p_request: {
        operation_id: operation.operationId,
        issue_approval_challenge: true,
      },
    },
  )

  if (challengeResponse.error) {
    throw mapSupabaseMcpError(challengeResponse.error)
  }

  let approvalNonce: string
  try {
    const envelope = parseMcpRpcEnvelope(challengeResponse.data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }

    const challenge = parseMcpApprovalChallenge(
      envelope.data,
      operation.operationId,
    )
    if (challenge.operation.payloadHash !== viewedPayloadHash) {
      throw new McpWebError(
        "PAYLOAD_MISMATCH",
        "La operación cambió antes de emitir la aprobación.",
        409,
      )
    }
    approvalNonce = challenge.nonce
  } catch (challengeError) {
    if (challengeError instanceof McpWebError) {
      throw challengeError
    }
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El control plane devolvió un challenge inválido.",
      502,
    )
  }

  const { data, error } = await session.supabase.rpc(
    "mcp_accounting_approve_expense",
    {
      p_request: {
        operation_id: operation.operationId,
        approval_nonce: approvalNonce,
      },
    },
  )

  if (error) {
    throw mapSupabaseMcpError(error)
  }

  try {
    const envelope = parseMcpRpcEnvelope(data)
    if (!envelope.ok) {
      throw mapSupabaseMcpError(envelope.error)
    }

    return parseMcpApprovalResult(envelope.data, operation.operationId)
  } catch (parseError) {
    if (parseError instanceof McpWebError) {
      throw parseError
    }
    throw new McpWebError(
      "INVALID_RESPONSE",
      "El control plane devolvió una aprobación inválida.",
      502,
    )
  }
}
