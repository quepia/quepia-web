// Normalización pura de respuestas y eventos de Zernio a las entradas de las
// RPC de ingesta. Sin E/S: se prueba con fixtures que replican las formas
// reales observadas el 2026-09-18.
import type {
  ZernioAccountRaw,
  ZernioAccountInsightsRaw,
  ZernioAnalyticsPostRaw,
  ZernioCommentRaw,
  ZernioDeltaEntryRaw,
  ZernioFollowerStatsRaw,
  ZernioHealthRaw,
  ZernioMessageRaw,
  ZernioTimelineRowRaw,
} from "./zernio-adapter"

/** Campo del proveedor → clave del catálogo de métricas. */
export const PROVIDER_METRIC_MAP: Record<string, string> = {
  views: "views",
  reach: "reach",
  impressions: "impressions",
  likes: "likes",
  comments: "comments",
  shares: "shares",
  saves: "saves",
  clicks: "clicks",
  follows: "follows",
  reposts: "reposts",
  igReelsAvgWatchTime: "ig_reels_avg_watch_time",
  igReelsVideoViewTotalTime: "ig_reels_total_watch_time",
  reelsSkipRate: "reels_skip_rate",
  completionRate: "completion_rate",
  profileViews: "profile_views",
  websiteClicks: "website_clicks",
  engagementRate: "provider_engagement_rate",
}

export function normalizeMetrics(raw: Record<string, unknown> | null | undefined): Record<string, number> {
  const metrics: Record<string, number> = {}
  if (!raw || typeof raw !== "object") return metrics
  for (const [providerField, key] of Object.entries(PROVIDER_METRIC_MAP)) {
    const value = raw[providerField]
    // Nulo/ausente ≠ cero: no se registra.
    if (typeof value === "number" && Number.isFinite(value)) metrics[key] = value
  }
  return metrics
}

const profileIdOf = (value: ZernioAccountRaw["profileId"]) =>
  typeof value === "string" ? value : value && typeof value === "object" ? value._id ?? null : null

export function normalizeAccount(account: ZernioAccountRaw) {
  return {
    zernio_account_id: account._id,
    zernio_profile_id: profileIdOf(account.profileId),
    platform: String(account.platform || "").toLowerCase(),
    username: account.username ?? null,
    display_name: account.displayName ?? null,
    profile_picture: account.profilePicture ?? null,
    profile_url: account.profileUrl ?? null,
    is_active: account.isActive !== false && account.enabled !== false,
    needs_reconnection: Boolean(account.needsReconnection),
    platform_user_id: account.platformUserId ?? null,
    permissions: Array.isArray(account.permissions) ? account.permissions.filter((item) => typeof item === "string") : [],
    followers_count: typeof account.followersCount === "number" ? account.followersCount : null,
    analytics_last_synced_at: account.analyticsLastSyncedAt ?? null,
    dm_backfill_status: account.dmHistoryBackfillStatus ?? null,
    token_expires_at: account.tokenExpiresAt ?? null,
    // Metadata sin tokens ni scopes crudos.
    metadata: sanitizePayload({ connectedAt: account.metadata?.connectedAt ?? null }),
  }
}

export function normalizeHealth(item: ZernioHealthRaw) {
  return {
    zernio_account_id: item.accountId,
    status: item.status ?? null,
    can_post: item.canPost ?? null,
    can_fetch_analytics: item.canFetchAnalytics ?? null,
    analytics_supported: item.analyticsSupported ?? null,
    token_expires_at: item.tokenExpiresAt ?? null,
    needs_reconnect: Boolean(item.needsReconnect) || item.tokenValid === false,
    issues: Array.isArray(item.issues) ? item.issues.slice(0, 20) : [],
    messaging_restriction: item.messagingRestriction ?? null,
  }
}

export type IngestPostItem = {
  zernio_account_id: string
  platform: string
  platform_post_id: string
  zernio_external_post_id: string | null
  zernio_post_id: string | null
  published_at: string | null
  permalink: string | null
  thumbnail_url: string | null
  caption: string | null
  media_type: string | null
  media_product_type: string | null
  is_ad: boolean
  is_deleted: boolean
  provider_synced_at: string | null
  sync_status: string | null
  metrics: Record<string, number>
}

/** Una publicación de /analytics → una fila por cuenta/plataforma. */
export function normalizeAnalyticsPost(post: ZernioAnalyticsPostRaw): IngestPostItem[] {
  const platforms = Array.isArray(post.platforms) ? post.platforms : []
  const single = platforms.length <= 1
  return platforms
    .filter((entry) => entry.accountId && entry.platformPostId)
    .map((entry) => {
      const analytics = (entry.analytics && Object.keys(entry.analytics).length > 0 ? entry.analytics : post.analytics) ?? {}
      const lastUpdated = typeof analytics.lastUpdated === "string" ? analytics.lastUpdated : null
      return {
        zernio_account_id: String(entry.accountId),
        platform: String(entry.platform || post.platform || "").toLowerCase(),
        platform_post_id: String(entry.platformPostId),
        zernio_external_post_id: single ? post._id : null,
        zernio_post_id: post.latePostId ?? null,
        published_at: post.publishedAt ?? null,
        permalink: entry.platformPostUrl ?? post.platformPostUrl ?? null,
        thumbnail_url: post.thumbnailUrl ?? null,
        caption: typeof post.content === "string" ? post.content.slice(0, 500) : null,
        media_type: post.mediaType ?? null,
        media_product_type: post.mediaProductType ?? null,
        is_ad: Boolean(post.isAd),
        is_deleted: false,
        provider_synced_at: lastUpdated,
        sync_status: entry.syncStatus ?? null,
        metrics: normalizeMetrics(analytics),
      }
    })
}

/** Entrada del delta: sin formato ni caption; solo ids, fechas y métricas. */
export function normalizeDeltaEntry(entry: ZernioDeltaEntryRaw): IngestPostItem {
  return {
    zernio_account_id: entry.accountId,
    platform: String(entry.platform || "").toLowerCase(),
    platform_post_id: entry.platformPostId,
    zernio_external_post_id: entry.postId,
    zernio_post_id: null,
    published_at: entry.publishedAt ?? null,
    permalink: null,
    thumbnail_url: null,
    caption: null,
    media_type: null,
    media_product_type: null,
    is_ad: false,
    is_deleted: Boolean(entry.isDeleted),
    provider_synced_at: entry.syncedAt ?? null,
    sync_status: null,
    metrics: normalizeMetrics(entry.metrics as Record<string, unknown>),
  }
}

/** Timeline: acumulado por día. Se agrupa por fecha y se filtra por publicación. */
export function normalizeTimeline(rows: ZernioTimelineRowRaw[], platformPostId?: string) {
  return rows
    .filter((row) => typeof row.date === "string" && (!platformPostId || !row.platformPostId || row.platformPostId === platformPostId))
    .map((row) => ({
      date: String(row.date).slice(0, 10),
      platform_post_id: row.platformPostId ?? null,
      metrics: normalizeMetrics(row),
    }))
}

export function normalizeFollowerStats(response: ZernioFollowerStatsRaw) {
  const items: Array<{ zernio_account_id: string; metric_key: string; day: string; value: number }> = []
  for (const [accountId, points] of Object.entries(response.stats ?? {})) {
    const byDay = new Map<string, number>()
    for (const point of Array.isArray(points) ? points : []) {
      if (typeof point?.followers !== "number" || typeof point?.date !== "string") continue
      byDay.set(point.date.slice(0, 10), point.followers)
    }
    for (const [day, value] of byDay) items.push({ zernio_account_id: accountId, metric_key: "followers", day, value })
  }
  return items
}

export const IG_INSIGHT_METRICS: Record<string, string> = {
  reach: "ig_account_reach",
  views: "ig_account_views",
  accounts_engaged: "ig_account_accounts_engaged",
  total_interactions: "ig_account_total_interactions",
}

export function normalizeInstagramInsights(
  zernioAccountId: string,
  since: string,
  until: string,
  response: ZernioAccountInsightsRaw,
) {
  const unavailable = new Map((response.unavailableMetrics ?? []).map((item) => [item.metric, item.reason ?? "no_data"]))
  return Object.entries(IG_INSIGHT_METRICS).map(([providerMetric, key]) => {
    const total = response.metrics?.[providerMetric]?.total
    const hasValue = typeof total === "number" && Number.isFinite(total)
    return {
      zernio_account_id: zernioAccountId,
      metric_key: key,
      period_start: since,
      period_end: until,
      value: hasValue ? total : null,
      unavailable_reason: hasValue ? null : unavailable.get(providerMetric) ?? "no_data",
    }
  })
}

// ---------------------------------------------------------------------------
// Bandeja: eventos y barridos
// ---------------------------------------------------------------------------

export type InteractionItem = {
  zernio_account_id: string
  kind: "dm" | "comment"
  thread_external_id: string
  platform: string
  participant?: { id?: string | null; name?: string | null; username?: string | null }
  post?: { platform_post_id?: string | null }
  provider_status?: string | null
  interaction: {
    external_id: string
    direction: "incoming" | "outgoing"
    author_id?: string | null
    author_name?: string | null
    author_username?: string | null
    is_own_account?: boolean
    text?: string | null
    attachments?: Array<{ type: string; original_type?: string | null }>
    parent_external_id?: string | null
    occurred_at?: string | null
    sent_via?: string | null
    is_deleted?: boolean
    deleted_at?: string | null
    edited_at?: string | null
    delivery_status?: string | null
  }
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null)
const obj = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

// Las URLs de adjuntos de Meta son firmadas y vencen: no se persisten.
function attachmentTypes(value: unknown) {
  return (Array.isArray(value) ? value : []).slice(0, 10).map((attachment) => {
    const record = obj(attachment)
    return { type: str(record.type) ?? "file", original_type: str(record.originalType) }
  })
}

export type NormalizedWebhook =
  | { kind: "interactions"; items: InteractionItem[] }
  | { kind: "account"; zernio_account_id: string | null; zernio_profile_id: string | null; event: string }
  | { kind: "analytics_signal"; zernio_account_id: string | null }
  | { kind: "ignored"; reason: string }

export function normalizeWebhookEvent(event: Record<string, unknown>): NormalizedWebhook {
  const type = String(event.event || "")
  const account = obj(event.account)
  const accountId = str(account.accountId) ?? str(account.id)

  if (type.startsWith("message.")) {
    const message = obj(event.message)
    const conversation = obj(event.conversation)
    const conversationId = str(message.conversationId) ?? str(conversation.id)
    const externalId = str(message.platformMessageId) ?? str(message.id)
    if (!accountId || !conversationId || !externalId) return { kind: "ignored", reason: "missing_ids" }
    const sender = obj(message.sender)
    const outgoing = message.direction === "outgoing" || type === "message.sent"
    return {
      kind: "interactions",
      items: [{
        zernio_account_id: accountId,
        kind: "dm",
        thread_external_id: conversationId,
        platform: String(message.platform || account.platform || ""),
        participant: {
          id: str(conversation.participantId) ?? (outgoing ? null : str(sender.id)),
          name: str(conversation.participantName) ?? (outgoing ? null : str(sender.name)),
          username: str(conversation.participantUsername) ?? (outgoing ? null : str(sender.username)),
        },
        interaction: {
          external_id: externalId,
          direction: outgoing ? "outgoing" : "incoming",
          author_id: outgoing ? null : str(sender.id),
          author_name: outgoing ? null : str(sender.name),
          author_username: outgoing ? null : str(sender.username),
          text: str(message.text),
          attachments: attachmentTypes(message.attachments),
          occurred_at: str(message.sentAt) ?? str(event.timestamp),
          sent_via: outgoing ? str(message.sentVia) : null,
          is_deleted: type === "message.deleted",
          deleted_at: type === "message.deleted" ? str(event.deletedAt) ?? str(event.timestamp) : null,
          edited_at: type === "message.edited" ? str(event.editedAt) ?? str(event.timestamp) : null,
          delivery_status: type === "message.delivered" ? "delivered" : type === "message.read" ? "read" : type === "message.failed" ? "failed" : null,
        },
      }],
    }
  }

  if (type === "comment.received") {
    const comment = obj(event.comment)
    const author = obj(comment.author)
    const commentId = str(comment.id)
    if (!accountId || !commentId) return { kind: "ignored", reason: "missing_ids" }
    const parent = comment.isReply ? str(comment.parentCommentId) : null
    const own = author.isOwnAccount === true
    return {
      kind: "interactions",
      items: [{
        zernio_account_id: accountId,
        kind: "comment",
        thread_external_id: parent ?? commentId,
        platform: String(comment.platform || account.platform || ""),
        participant: own ? {} : { id: str(author.id), name: str(author.name), username: str(author.username) },
        post: { platform_post_id: str(comment.platformPostId) ?? str(obj(event.post).platformPostId) },
        interaction: {
          external_id: commentId,
          direction: own ? "outgoing" : "incoming",
          author_id: str(author.id),
          author_name: str(author.name),
          author_username: str(author.username),
          is_own_account: own,
          text: str(comment.text),
          parent_external_id: parent,
          occurred_at: str(comment.createdAt) ?? str(event.timestamp),
          sent_via: null,
        },
      }],
    }
  }

  if (type === "account.connected" || type === "account.disconnected") {
    return { kind: "account", zernio_account_id: accountId, zernio_profile_id: str(account.profileId), event: type }
  }
  if (type === "analytics.synced") return { kind: "analytics_signal", zernio_account_id: accountId }
  return { kind: "ignored", reason: `event_not_handled:${type}` }
}

export function normalizeRestMessage(message: ZernioMessageRaw, zernioAccountId: string, conversation: {
  id: string; platform?: string; participantId?: string; participantName?: string; participantUsername?: string; status?: string
}): InteractionItem | null {
  if (!message?.id) return null
  const outgoing = message.direction === "outgoing"
  return {
    zernio_account_id: zernioAccountId,
    kind: "dm",
    thread_external_id: conversation.id,
    platform: String(message.platform || conversation.platform || ""),
    participant: { id: conversation.participantId ?? null, name: conversation.participantName ?? null, username: conversation.participantUsername ?? null },
    provider_status: conversation.status ?? null,
    interaction: {
      external_id: message.id,
      direction: outgoing ? "outgoing" : "incoming",
      author_id: outgoing ? null : message.senderId ?? null,
      author_name: outgoing ? null : message.senderName ?? null,
      text: message.message ?? null,
      attachments: attachmentTypes(message.attachments),
      occurred_at: message.createdAt ?? null,
      sent_via: outgoing ? message.sentVia ?? null : null,
      is_deleted: Boolean(message.isDeleted),
      deleted_at: message.deletedAt ?? null,
      delivery_status: message.deliveryStatus ?? null,
    },
  }
}

export function normalizeRestComments(comments: ZernioCommentRaw[], zernioAccountId: string, platform: string, platformPostId: string) {
  const items: InteractionItem[] = []
  const push = (comment: ZernioCommentRaw, rootId: string, parentId: string | null) => {
    if (!comment?.id) return
    const own = comment.from?.isOwner === true
    items.push({
      zernio_account_id: zernioAccountId,
      kind: "comment",
      thread_external_id: rootId,
      platform,
      participant: own || parentId ? undefined : { id: comment.from?.id ?? null, name: comment.from?.name ?? null, username: comment.from?.username ?? null },
      post: { platform_post_id: platformPostId },
      interaction: {
        external_id: comment.id,
        direction: own ? "outgoing" : "incoming",
        author_id: comment.from?.id ?? null,
        author_name: comment.from?.name ?? null,
        author_username: comment.from?.username ?? null,
        is_own_account: own,
        text: comment.message ?? null,
        parent_external_id: parentId,
        occurred_at: comment.createdTime ?? null,
      },
    })
  }
  for (const comment of comments) {
    push(comment, comment.id, null)
    for (const reply of comment.replies ?? []) push(reply, comment.id, comment.id)
  }
  return items
}

// ---------------------------------------------------------------------------
// Saneamiento de payloads originales antes de persistirlos
// ---------------------------------------------------------------------------

const SECRET_KEY = /(token|secret|password|authorization|api[-_]?key|signature|cookie|refresh|credential|scope)/i
const EXPIRING_URL_KEY = /^(url|refreshUrl|previewUrl|imageUrl|picture|profilePicture|thumbnail)$/

export function sanitizePayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[profundidad]"
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizePayload(item, depth + 1))
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) {
        result[key] = "[redactado]"
        continue
      }
      if (EXPIRING_URL_KEY.test(key) && typeof item === "string") {
        result[key] = "[url omitida]"
        continue
      }
      result[key] = sanitizePayload(item, depth + 1)
    }
    return result
  }
  if (typeof value === "string" && value.length > 8000) return `${value.slice(0, 8000)}…`
  return value
}

export function webhookContainsPrivateContent(eventType: string) {
  return eventType.startsWith("message.") || eventType.startsWith("conversation.") || eventType === "comment.received"
}
