export const CAPABILITIES = {
  accountingRead: "accounting.read",
  accountingExpenseWrite: "accounting.expense.write",
  accountingIncomeWrite: "accounting.income.write",
  accountingTransferWrite: "accounting.transfer.write",
  accountingInvoiceWrite: "accounting.invoice.write",
  tasksRead: "tasks.read",
  tasksWrite: "tasks.write",
  tasksStructureWrite: "tasks.structure.write",
  tasksNotify: "tasks.notify",
  intelligenceRead: "intelligence.read",
  socialAnalyticsRead: "social.analytics.read",
  socialPublishWrite: "social.publish.write",
} as const;

export const ACCOUNTING_WRITE_CAPABILITIES = [
  CAPABILITIES.accountingExpenseWrite,
  CAPABILITIES.accountingIncomeWrite,
  CAPABILITIES.accountingTransferWrite,
] as const;

// Anular alcanza cualquier escritura del modulo, asi que la herramienta se
// ofrece a quien tenga alguna de las tres capacidades que escriben tareas.
export const TASKS_WRITE_CAPABILITIES = [
  CAPABILITIES.tasksWrite,
  CAPABILITIES.tasksStructureWrite,
  CAPABILITIES.tasksNotify,
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
  // La emisión en ARCA la hace la web, dueña de la clave fiscal. Se le
  // reenvía el token del usuario y Postgres vuelve a autorizar todo.
  issueInvoice(request: unknown): Promise<RpcEnvelope>;
  issueCreditNote(request: unknown): Promise<RpcEnvelope>;
  // Zernio y el almacenamiento de piezas también son de la web. `action` es
  // el segmento de /api/social/mcp/<action>.
  socialPublishing(action: SocialPublishingAction, request: unknown): Promise<RpcEnvelope>;
}

export type SocialPublishingAction =
  | "targets"
  | "publications"
  | "upload-url"
  | "attach-media"
  | "remove-media"
  | "publish"
  | "cancel"
  | "retry";

export type DatabaseAccessFactory = (
  identity: AuthIdentity,
) => DatabaseAccess;
