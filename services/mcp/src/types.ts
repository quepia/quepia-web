export const CAPABILITIES = {
  accountingRead: "accounting.read",
  accountingExpenseWrite: "accounting.expense.write",
  accountingIncomeWrite: "accounting.income.write",
  accountingTransferWrite: "accounting.transfer.write",
} as const;

export const ACCOUNTING_WRITE_CAPABILITIES = [
  CAPABILITIES.accountingExpenseWrite,
  CAPABILITIES.accountingIncomeWrite,
  CAPABILITIES.accountingTransferWrite,
] as const;

export type AssuranceLevel = "aal1" | "aal2";

export interface AuthIdentity {
  subject: string;
  clientId: string;
  sessionId: string;
  aal: AssuranceLevel;
  token: string;
}

export interface McpAccessContext {
  userId: string;
  clientId: string;
  sessionId: string;
  capabilities: ReadonlySet<string>;
  readOnly: boolean;
  grantExpiresAt?: string;
}

export interface RpcError {
  code: string;
  message: string;
  details?: unknown;
}

export interface RpcEnvelope {
  ok: boolean;
  data?: unknown;
  error?: RpcError | null;
}

export interface DatabaseAccess {
  getContext(): Promise<McpAccessContext>;
  call(rpcName: string, request: unknown): Promise<RpcEnvelope>;
}

export type DatabaseAccessFactory = (
  identity: AuthIdentity,
) => DatabaseAccess;
