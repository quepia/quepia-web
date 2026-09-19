// Adaptador Zernio del módulo social. Separado del cliente del publicador
// (lib/zernio/client.ts) para no alterar publicación/programación.
//
// Contratos verificados en docs.zernio.com (llms.txt y páginas .mdx) y con GET
// acotados el 2026-09-18. Solo se usan endpoints documentados.

export const ZERNIO_API_BASE = "https://zernio.com/api/v1"

export type ZernioErrorKind =
  | "billing"
  | "unauthenticated"
  | "permission"
  | "not_found"
  | "rate_limited"
  | "invalid"
  | "conflict"
  | "server"
  | "unavailable"
  | "timeout"
  | "network"
  | "pending"

export type RateInfo = { limit: number | null; remaining: number | null; resetAt: number | null }

export class ZernioAdapterError extends Error {
  kind: ZernioErrorKind
  status: number
  code?: string
  retryAfterSeconds?: number
  /** true cuando una escritura pudo haberse aplicado (timeout/5xx tras enviar). */
  ambiguous: boolean
  terminal: boolean
  details?: unknown

  constructor(input: {
    kind: ZernioErrorKind
    status: number
    message: string
    code?: string
    retryAfterSeconds?: number
    ambiguous?: boolean
    details?: unknown
  }) {
    super(input.message)
    this.name = "ZernioAdapterError"
    this.kind = input.kind
    this.status = input.status
    this.code = input.code
    this.retryAfterSeconds = input.retryAfterSeconds
    this.ambiguous = Boolean(input.ambiguous)
    this.terminal = ["billing", "unauthenticated", "permission", "invalid", "not_found", "conflict"].includes(input.kind)
    this.details = input.details
  }
}

export type AdapterOptions = {
  apiKey?: string
  fetchImpl?: typeof fetch
  baseUrl?: string
  defaultTimeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  onRate?: (path: string, rate: RateInfo) => void
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  idempotencyKey?: string
  timeoutMs?: number
  /** Solo GET se reintenta automáticamente. */
  maxAttempts?: number
}

export type ZernioResponse<T> = { status: number; data: T; rate: RateInfo }

function parseRate(headers: Headers): RateInfo {
  const number = (name: string) => {
    const value = Number(headers.get(name))
    return Number.isFinite(value) && headers.get(name) !== null ? value : null
  }
  return { limit: number("x-ratelimit-limit"), remaining: number("x-ratelimit-remaining"), resetAt: number("x-ratelimit-reset") }
}

function retryAfterSeconds(headers: Headers, rate: RateInfo, now: number): number | undefined {
  const header = headers.get("retry-after")
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds))
    const date = Date.parse(header)
    if (Number.isFinite(date)) return Math.max(0, Math.ceil((date - now) / 1000))
  }
  if (rate.resetAt) return Math.max(1, Math.ceil(rate.resetAt - now / 1000))
  return undefined
}

function messageFrom(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (typeof record.error === "string") return record.error
    if (record.error && typeof record.error === "object" && typeof (record.error as Record<string, unknown>).message === "string") {
      return String((record.error as Record<string, unknown>).message)
    }
    if (typeof record.message === "string") return record.message
  }
  return `Zernio respondió con estado ${status}`
}

export function classifyStatus(status: number): ZernioErrorKind {
  if (status === 402) return "billing"
  if (status === 401) return "unauthenticated"
  if (status === 403) return "permission"
  if (status === 404) return "not_found"
  if (status === 409) return "conflict"
  if (status === 429) return "rate_limited"
  if (status === 503) return "unavailable"
  if (status >= 500) return "server"
  return "invalid"
}

export function createZernioAdapter(options: AdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  // SOCIAL_ZERNIO_API_BASE solo existe para entornos de prueba locales (Zernio
  // simulado); en producción no se define y se usa la base oficial.
  const baseUrl = options.baseUrl ?? (process.env.SOCIAL_ZERNIO_API_BASE?.trim() || ZERNIO_API_BASE)
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const random = options.random ?? Math.random
  const apiKey = () => {
    const key = (options.apiKey ?? process.env.ZERNIO_API_KEY ?? "").trim()
    if (!key) throw new ZernioAdapterError({ kind: "unauthenticated", status: 503, message: "ZERNIO_API_KEY no está configurada" })
    return key
  }

  async function request<T>(path: string, init: RequestOptions = {}): Promise<ZernioResponse<T>> {
    const method = init.method ?? "GET"
    const url = new URL(`${baseUrl}${path}`)
    for (const [key, value] of Object.entries(init.query ?? {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value))
    }
    const maxAttempts = method === "GET" ? Math.max(1, init.maxAttempts ?? 3) : 1
    let lastError: ZernioAdapterError | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey()}`,
            Accept: "application/json",
            ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          cache: "no-store",
          signal: AbortSignal.timeout(init.timeoutMs ?? options.defaultTimeoutMs ?? 20_000),
        })
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
        lastError = new ZernioAdapterError({
          kind: timedOut ? "timeout" : "network",
          status: 0,
          message: timedOut ? "Zernio no respondió a tiempo" : "No se pudo contactar a Zernio",
          ambiguous: method !== "GET",
        })
        if (method !== "GET") throw lastError
        if (attempt < maxAttempts) await sleep(backoff(attempt))
        continue
      }

      const rate = parseRate(response.headers)
      options.onRate?.(path, rate)
      const payload = await response.json().catch(() => null)
      if (response.ok) return { status: response.status, data: payload as T, rate }

      const kind = classifyStatus(response.status)
      const retryAfter = kind === "rate_limited" || kind === "unavailable"
        ? retryAfterSeconds(response.headers, rate, Date.now())
        : undefined
      lastError = new ZernioAdapterError({
        kind,
        status: response.status,
        message: messageFrom(payload, response.status),
        code: payload && typeof payload === "object" ? (payload as Record<string, unknown>).code as string | undefined : undefined,
        retryAfterSeconds: retryAfter,
        ambiguous: method !== "GET" && (kind === "server"),
        details: payload && typeof payload === "object" ? (payload as Record<string, unknown>).details : undefined,
      })
      if (lastError.terminal || method !== "GET") throw lastError
      if (attempt < maxAttempts) {
        // Esperas cortas en línea; esperas largas se delegan a la cola.
        const waitMs = retryAfter !== undefined ? retryAfter * 1000 : backoff(attempt)
        if (waitMs > 15_000) throw lastError
        await sleep(waitMs)
      }
    }
    throw lastError ?? new ZernioAdapterError({ kind: "network", status: 0, message: "Falla desconocida" })
  }

  function backoff(attempt: number) {
    return Math.min(8_000, 400 * 2 ** (attempt - 1)) + Math.floor(random() * 250)
  }

  return {
    request,
    // Inventario y salud
    listProfiles: () => request<{ profiles: ZernioProfile[] }>("/profiles"),
    listAccounts: (profileId?: string) => request<{ accounts: ZernioAccountRaw[] }>("/accounts", { query: { profileId } }),
    accountsHealth: () => request<{ accounts: ZernioHealthRaw[] }>("/accounts/health"),
    followerStats: (query: { fromDate: string; toDate: string; accountIds?: string }) =>
      request<ZernioFollowerStatsRaw>("/accounts/follower-stats", { query }),
    usage: () => request<Record<string, unknown>>("/usage"),
    // Analítica
    analyticsPage: (query: { page: number; limit: number; fromDate?: string; toDate?: string; profileId?: string; accountId?: string }) =>
      request<ZernioAnalyticsListRaw>("/analytics", { query }),
    analyticsDelta: (cursor?: string, limit = 200) =>
      request<{ data: ZernioDeltaEntryRaw[]; nextCursor: string; hasMore: boolean }>("/analytics/delta", { query: { cursor, limit } }),
    postTimeline: (postId: string, fromDate?: string) =>
      request<{ postId: string; timeline: ZernioTimelineRowRaw[] }>("/analytics/post-timeline", { query: { postId, fromDate } }),
    instagramAccountInsights: (query: { accountId: string; since: string; until: string; metrics: string }) =>
      request<ZernioAccountInsightsRaw>("/analytics/instagram/account-insights", { query: { ...query, metricType: "total_value" } }),
    // Bandeja
    listConversations: (query: { accountId?: string; profileId?: string; cursor?: string; limit?: number; sortOrder?: string }) =>
      request<{ data: ZernioConversationRaw[]; pagination?: { hasMore?: boolean; nextCursor?: string | null }; meta?: Record<string, unknown> }>(
        "/inbox/conversations", { query }),
    listMessages: (conversationId: string, query: { accountId: string; cursor?: string; limit?: number; sortOrder?: string }) =>
      request<{ messages: ZernioMessageRaw[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } }>(
        `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { query }),
    listCommentedPosts: (query: { accountId?: string; profileId?: string; since?: string; cursor?: string; limit?: number }) =>
      request<{ data: ZernioCommentedPostRaw[]; pagination?: { hasMore?: boolean; nextCursor?: string | null } }>("/inbox/comments", { query }),
    listPostComments: (postId: string, query: { accountId: string; cursor?: string; limit?: number }) =>
      request<{ comments: ZernioCommentRaw[]; pagination?: { hasMore?: boolean; cursor?: string | null } }>(
        `/inbox/comments/${encodeURIComponent(postId)}`, { query }),
    sendMessage: (conversationId: string, body: { accountId: string; message: string }, idempotencyKey: string) =>
      request<{ success?: boolean; data?: { messageId?: string; messageIds?: string[] } }>(
        `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body, idempotencyKey, timeoutMs: 25_000 }),
    replyToComment: (postId: string, body: { accountId: string; message: string; commentId?: string }, idempotencyKey: string) =>
      request<{ success?: boolean; data?: { commentId?: string } }>(
        `/inbox/comments/${encodeURIComponent(postId)}`, { method: "POST", body, idempotencyKey, timeoutMs: 25_000 }),
    // Sin Idempotency-Key documentado: una sola respuesta por comentario.
    privateReply: (postId: string, commentId: string, body: { accountId: string; message: string }) =>
      request<{ status?: string; messageId?: string; commentId?: string }>(
        `/inbox/comments/${encodeURIComponent(postId)}/${encodeURIComponent(commentId)}/private-reply`, { method: "POST", body, timeoutMs: 25_000 }),
    // Automatizaciones comentario→DM
    listCommentAutomations: (profileId?: string) =>
      request<{ automations: ZernioAutomationRaw[] }>("/comment-automations", { query: { profileId } }),
    createCommentAutomation: (body: Record<string, unknown>) =>
      request<{ automation?: ZernioAutomationRaw; success?: boolean }>("/comment-automations", { method: "POST", body }),
    updateCommentAutomation: (automationId: string, body: Record<string, unknown>) =>
      request<{ automation?: ZernioAutomationRaw; success?: boolean }>(`/comment-automations/${encodeURIComponent(automationId)}`, { method: "PATCH", body }),
    listCommentAutomationLogs: (automationId: string, query: { limit?: number; skip?: number }) =>
      request<{ logs: Record<string, unknown>[]; pagination?: { hasMore?: boolean } }>(
        `/comment-automations/${encodeURIComponent(automationId)}/logs`, { query }),
  }
}

export type ZernioAdapter = ReturnType<typeof createZernioAdapter>

// --- Formas de respuesta (solo campos usados) ---

export type ZernioProfile = { _id: string; name?: string; isDefault?: boolean }
export type ZernioAccountRaw = {
  _id: string
  platform: string
  username?: string | null
  displayName?: string | null
  profilePicture?: string | null
  profileUrl?: string | null
  isActive?: boolean
  enabled?: boolean
  needsReconnection?: boolean
  permissions?: string[]
  platformUserId?: string | null
  followersCount?: number | null
  analyticsLastSyncedAt?: string | null
  dmHistoryBackfillStatus?: string | null
  tokenExpiresAt?: string | null
  profileId?: { _id?: string; name?: string } | string | null
  metadata?: Record<string, unknown> | null
}
export type ZernioHealthRaw = {
  accountId: string
  platform?: string
  status?: string
  canPost?: boolean
  canFetchAnalytics?: boolean
  analyticsSupported?: boolean
  tokenValid?: boolean
  tokenExpiresAt?: string | null
  needsReconnect?: boolean
  issues?: unknown[]
  messagingRestriction?: unknown
}
export type ZernioFollowerStatsRaw = {
  accounts?: Array<{ _id: string; platform?: string; accountStats?: { accountType?: string } }>
  stats?: Record<string, Array<{ date: string; followers: number }>>
}
export type ZernioPostAnalyticsRaw = Record<string, unknown>
export type ZernioAnalyticsPostRaw = {
  _id: string
  latePostId?: string | null
  content?: string | null
  publishedAt?: string | null
  status?: string
  analytics?: ZernioPostAnalyticsRaw
  platforms?: Array<{
    platform?: string
    status?: string
    platformPostId?: string
    accountId?: string
    accountUsername?: string
    analytics?: ZernioPostAnalyticsRaw
    syncStatus?: string
    platformPostUrl?: string
  }>
  platform?: string
  platformPostUrl?: string | null
  isExternal?: boolean
  isAd?: boolean
  thumbnailUrl?: string | null
  mediaType?: string | null
  mediaProductType?: string
}
export type ZernioAnalyticsListRaw = {
  posts?: ZernioAnalyticsPostRaw[]
  pagination?: { page?: number; pages?: number; total?: number }
  overview?: Record<string, unknown>
}
export type ZernioDeltaEntryRaw = {
  postId: string
  accountId: string
  profileId?: string
  platform: string
  platformPostId: string
  publishedAt?: string
  syncedAt?: string
  isDeleted?: boolean
  metrics?: Record<string, unknown>
}
export type ZernioTimelineRowRaw = Record<string, unknown> & { date: string; platform?: string; platformPostId?: string }
export type ZernioAccountInsightsRaw = {
  metrics?: Record<string, { total?: number }>
  unavailableMetrics?: Array<{ metric: string; reason?: string }>
  dateRange?: { since?: string; until?: string }
}
export type ZernioConversationRaw = {
  id: string
  platform?: string
  accountId?: string
  participantId?: string
  participantName?: string
  participantUsername?: string
  status?: string
  updatedTime?: string
}
export type ZernioMessageRaw = {
  id: string
  conversationId?: string
  accountId?: string
  platform?: string
  message?: string | null
  senderId?: string
  senderName?: string | null
  direction?: "incoming" | "outgoing"
  createdAt?: string
  attachments?: Array<Record<string, unknown>>
  isDeleted?: boolean
  deletedAt?: string | null
  deliveryStatus?: string | null
  sentVia?: string | null
}
export type ZernioCommentedPostRaw = { id: string; platform?: string; accountId?: string; createdTime?: string; commentCount?: number; isAd?: boolean }
export type ZernioCommentRaw = {
  id: string
  message?: string
  createdTime?: string
  from?: { id?: string; name?: string; username?: string; isOwner?: boolean }
  replies?: ZernioCommentRaw[]
  parentId?: string | null
  isHidden?: boolean
}
export type ZernioAutomationRaw = Record<string, unknown> & { id?: string; _id?: string }
