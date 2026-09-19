// Worker del módulo social. Procesa la cola durable (sistema_social_jobs) en
// lotes acotados por tiempo. No depende de abrir ninguna pantalla: lo invocan
// el cron diario de Vercel, el workflow programado de GitHub y el receptor de
// webhooks (after()). Dependencias inyectadas para poder probarlo con PGlite y
// un Zernio simulado.
import { ZernioAdapterError, type RateInfo, type ZernioAdapter } from "./zernio-adapter"
import {
  normalizeAccount,
  normalizeAnalyticsPost,
  normalizeDeltaEntry,
  normalizeFollowerStats,
  normalizeHealth,
  normalizeInstagramInsights,
  normalizeRestComments,
  normalizeRestMessage,
  normalizeTimeline,
  normalizeWebhookEvent,
  type InteractionItem,
} from "./normalize"
import { toZernioAutomationBody } from "./automation-simulator"
import { SocialError } from "./errors"

export type SocialRpc = <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<T>

type Job = { id: string; kind: string; payload: Record<string, unknown>; attempts: number; max_attempts: number; correlation_id: string }

type WorkerAccount = {
  id: string
  zernio_account_id: string
  platform: string
  client_id: string
  permissions: string[]
  health_status: string
  zernio_profile_id: string
}

export type WorkerDeps = {
  rpc: SocialRpc
  zernio: ZernioAdapter
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  log?: (event: string, data: Record<string, unknown>) => void
  config?: Partial<WorkerConfig>
}

export type WorkerConfig = {
  bootstrapDays: number
  inboxLookbackDays: number
  maxConversationsPerAccount: number
  maxCommentedPostsPerAccount: number
  timelineBatch: number
  deltaMaxPages: number
  /** Solicitudes por minuto que se reservan para publicación y respuestas humanas. */
  rateReserve: number
  emptyDeltaAdvanceMinutes: number
}

const DEFAULT_CONFIG: WorkerConfig = {
  bootstrapDays: 180,
  inboxLookbackDays: 14,
  maxConversationsPerAccount: 20,
  maxCommentedPostsPerAccount: 15,
  timelineBatch: 15,
  deltaMaxPages: 20,
  rateReserve: 12,
  emptyDeltaAdvanceMinutes: 30,
}

export const JOB_PRIORITY: Record<string, number> = {
  "outbox.dispatch": 5,
  "webhook.process": 10,
  "outbox.reconcile": 12,
  "analytics.delta": 20,
  "internal.automations": 25,
  "health.check": 30,
  "inventory.reconcile": 30,
  "followers.daily": 40,
  "ig_insights.refresh": 50,
  "inbox.backfill": 50,
  "automations.sync": 50,
  "timeline.backfill": 70,
  "analytics.bootstrap": 80,
  "retention.apply": 90,
}

const LOCAL_OR_PRIORITY_JOBS = new Set(["outbox.dispatch", "webhook.process", "internal.automations", "retention.apply"])

const dateOnly = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)

export class QuotaReserveReached extends Error {}

export function createSocialWorker(deps: WorkerDeps) {
  const config = { ...DEFAULT_CONFIG, ...deps.config }
  const now = deps.now ?? (() => new Date())
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const log = deps.log ?? ((event, data) => console.info(JSON.stringify({ scope: "social-worker", event, ...data })))
  const { rpc, zernio } = deps
  let lastRate: RateInfo | null = null

  const observe = <T extends { rate: RateInfo }>(response: T) => {
    lastRate = response.rate
    return response
  }

  function assertQuota() {
    if (lastRate?.remaining !== null && lastRate?.remaining !== undefined && lastRate.limit && lastRate.limit >= 60
      && lastRate.remaining <= config.rateReserve) {
      throw new QuotaReserveReached(`Cuota reservada para publicación (${lastRate.remaining}/${lastRate.limit})`)
    }
  }

  async function workerAccounts() {
    return rpc<{ accounts: WorkerAccount[]; profiles: Array<{ id: string; zernio_profile_id: string; client_id: string }> }>("social_worker_accounts")
  }

  async function recordRun(job: Job | null, stream: string, scopeKey: string, startedAt: Date, stats: Record<string, unknown>, status = "succeeded", error?: string) {
    await rpc("social_record_sync_run", {
      p_run: { job_id: job?.id ?? null, stream, scope_key: scopeKey, status, started_at: startedAt.toISOString(), error, correlation_id: job?.correlation_id, ...stats },
    }).catch(() => undefined)
  }

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handlers: Record<string, (job: Job) => Promise<Record<string, unknown>>> = {
    async "inventory.reconcile"(job) {
      const startedAt = now()
      const profiles = observe(await zernio.listProfiles()).data.profiles ?? []
      await rpc("social_register_provider_profiles", {
        p_profiles: profiles.map((profile) => ({ zernio_profile_id: profile._id, name: profile.name })),
      })
      const accounts = observe(await zernio.listAccounts()).data.accounts ?? []
      const byProfile = new Map<string, ReturnType<typeof normalizeAccount>[]>()
      for (const profile of profiles) byProfile.set(profile._id, [])
      for (const account of accounts) {
        const normalized = normalizeAccount(account)
        if (!normalized.zernio_profile_id) continue
        if (!byProfile.has(normalized.zernio_profile_id)) byProfile.set(normalized.zernio_profile_id, [])
        byProfile.get(normalized.zernio_profile_id)!.push(normalized)
      }
      const results: Record<string, unknown> = {}
      for (const [profileId, items] of byProfile) {
        // Listado completo de la clave: las ausentes se marcan eliminadas del
        // proveedor (reversible si reaparecen).
        results[profileId] = await rpc("social_reconcile_provider_profile", {
          p_zernio_profile_id: profileId, p_accounts: items, p_complete: true,
        }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
      }
      await recordRun(job, "inventory", "global", startedAt, { items_seen: accounts.length, items_written: accounts.length })
      return { profiles: profiles.length, accounts: accounts.length }
    },

    async "health.check"(job) {
      const startedAt = now()
      const response = observe(await zernio.accountsHealth())
      const items = (response.data.accounts ?? []).map(normalizeHealth)
      const applied = await rpc<{ updated: number; unknown_accounts: string[] }>("social_apply_account_health", { p_items: items })
      await recordRun(job, "health", "global", startedAt, { items_seen: items.length, items_written: applied.updated })
      return applied
    },

    async "analytics.bootstrap"(job) {
      const startedAt = now()
      await rpc("social_set_sync_state", { p_stream: "analytics_delta", p_scope_key: "global", p_status: "bootstrapping", p_cursor: null, p_cursor_obtained_at: null, p_error: null, p_details: null, p_success: false })
      // 1) Tomar el cursor ANTES del baseline (contrato del delta).
      const initial = observe(await zernio.analyticsDelta(undefined, 1))
      const cursor = initial.data.nextCursor
      if (!cursor) throw new SocialError(502, "missing_cursor", "El delta no devolvió cursor inicial")
      const cursorAt = now().toISOString()
      // 2) Baseline paginado desde /analytics.
      const days = Number(job.payload.days) > 0 ? Math.min(366, Number(job.payload.days)) : config.bootstrapDays
      const fromDate = dateOnly(addDays(now(), -days + 1))
      const toDate = dateOnly(now())
      let page = 1
      let pages = 1
      let written = 0
      let skipped = 0
      do {
        assertQuota()
        const response = observe(await zernio.analyticsPage({ page, limit: 100, fromDate, toDate }))
        pages = Math.max(1, Number(response.data.pagination?.pages ?? 1))
        const items = (response.data.posts ?? []).flatMap(normalizeAnalyticsPost)
        const result = await rpc<{ written: number; skipped_unknown_account: number; skipped_unassigned_client: number }>(
          "social_ingest_posts", { p_items: items, p_source: "analytics", p_observed_at: now().toISOString() })
        written += result.written
        skipped += result.skipped_unknown_account + result.skipped_unassigned_client
        page += 1
        await sleep(200)
      } while (page <= pages && page <= 50)
      // 3) Guardar el cursor tomado antes del baseline: el solapamiento es seguro
      //    porque los valores son absolutos.
      await rpc("social_set_sync_state", {
        p_stream: "analytics_delta", p_scope_key: "global", p_status: "ok", p_cursor: cursor, p_cursor_obtained_at: cursorAt,
        p_error: null, p_details: { bootstrapped_at: now().toISOString(), baseline_from: fromDate }, p_success: true,
      })
      await recordRun(job, "analytics_bootstrap", "global", startedAt, { pages: page - 1, items_written: written, items_skipped: skipped,
        coverage: { from: fromDate, to: toDate } })
      return { pages: page - 1, written, skipped }
    },

    async "analytics.delta"(job) {
      const startedAt = now()
      const state = await rpc<{ cursor: string | null; cursor_obtained_at: string | null; status: string } | null>(
        "social_get_sync_state", { p_stream: "analytics_delta", p_scope_key: "global" })
      if (!state?.cursor) {
        await rpc("social_schedule_jobs", { p_specs: [{ kind: "analytics.bootstrap", dedupe_key: "analytics.bootstrap", priority: JOB_PRIORITY["analytics.bootstrap"], window_hours: 1 }] })
        return { bootstrap_requested: true }
      }
      let cursor = state.cursor
      let cursorObtainedAt = state.cursor_obtained_at ? new Date(state.cursor_obtained_at) : now()
      let pages = 0
      let entries = 0
      let written = 0
      for (let index = 0; index < config.deltaMaxPages; index += 1) {
        assertQuota()
        let response
        try {
          response = observe(await zernio.analyticsDelta(cursor, 200))
        } catch (error) {
          if (error instanceof ZernioAdapterError && error.status === 400) {
            // Cursor vencido (>6 días) o inválido: repetir bootstrap.
            await rpc("social_set_sync_state", { p_stream: "analytics_delta", p_scope_key: "global", p_status: "expired", p_cursor: null,
              p_cursor_obtained_at: null, p_error: error.message, p_details: null, p_success: false })
            await rpc("social_schedule_jobs", { p_specs: [{ kind: "analytics.bootstrap", dedupe_key: "analytics.bootstrap", priority: JOB_PRIORITY["analytics.bootstrap"], window_hours: 1 }] })
            return { expired: true }
          }
          throw error
        }
        pages += 1
        const data = response.data.data ?? []
        const next = response.data.nextCursor
        const ageMinutes = (now().getTime() - cursorObtainedAt.getTime()) / 60_000
        if (data.length === 0 && ageMinutes < config.emptyDeltaAdvanceMinutes) {
          // Página vacía reciente: el feed retiene los últimos segundos. No
          // avanzar (contrato del delta); se repite con el mismo cursor.
          break
        }
        const applied = await rpc<{ ingest: { written: number } }>("social_apply_delta_page", {
          p_entries: data.map(normalizeDeltaEntry), p_previous_cursor: cursor, p_next_cursor: next, p_scope_key: "global",
        })
        entries += data.length
        written += applied.ingest?.written ?? 0
        cursor = next
        cursorObtainedAt = now()
        if (!response.data.hasMore) break
      }
      await recordRun(job, "analytics_delta", "global", startedAt, { pages, items_seen: entries, items_written: written })
      return { pages, entries, written }
    },

    async "followers.daily"(job) {
      const startedAt = now()
      const response = observe(await zernio.followerStats({ fromDate: dateOnly(addDays(now(), -35)), toDate: dateOnly(now()) }))
      const items = normalizeFollowerStats(response.data)
      const result = await rpc<{ written: number; skipped: number }>("social_ingest_account_daily", { p_items: items, p_source: "zernio:follower-stats" })
      await recordRun(job, "followers", "global", startedAt, { items_seen: items.length, items_written: result.written, items_skipped: result.skipped })
      return result
    },

    async "timeline.backfill"(job) {
      const startedAt = now()
      const ids = await rpc<string[]>("social_posts_needing_timeline", { p_limit: config.timelineBatch })
      let written = 0
      let failed = 0
      for (const id of ids) {
        assertQuota()
        try {
          const response = observe(await zernio.postTimeline(id))
          const rows = normalizeTimeline(response.data.timeline ?? [])
          const result = await rpc<{ written: number }>("social_ingest_post_timeline", { p_zernio_external_post_id: id, p_rows: rows })
          written += result.written
        } catch (error) {
          if (error instanceof QuotaReserveReached) throw error
          failed += 1
          log("timeline.failed", { job: job.id, post: id, error: error instanceof Error ? error.message : String(error) })
        }
        await sleep(200)
      }
      await recordRun(job, "timeline", "global", startedAt, { items_seen: ids.length, items_written: written, items_skipped: failed },
        failed > 0 ? "partial" : "succeeded")
      return { posts: ids.length, written, failed }
    },

    async "ig_insights.refresh"(job) {
      const startedAt = now()
      const { accounts } = await workerAccounts()
      const until = dateOnly(addDays(now(), -1))
      let written = 0
      for (const account of accounts.filter((item) => item.platform === "instagram")) {
        for (const days of [7, 30]) {
          assertQuota()
          const since = dateOnly(addDays(now(), -days))
          try {
            const response = observe(await zernio.instagramAccountInsights({
              accountId: account.zernio_account_id, since, until, metrics: "reach,views,accounts_engaged,total_interactions",
            }))
            const items = normalizeInstagramInsights(account.zernio_account_id, since, until, response.data)
            const result = await rpc<{ written: number }>("social_ingest_account_period_metrics", { p_items: items, p_source: "zernio:ig-account-insights" })
            written += result.written
          } catch (error) {
            if (error instanceof QuotaReserveReached) throw error
            log("ig_insights.failed", { job: job.id, account: account.id, error: error instanceof Error ? error.message : String(error) })
          }
        }
      }
      await recordRun(job, "ig_insights", "global", startedAt, { items_written: written })
      return { written }
    },

    async "inbox.backfill"(job) {
      const startedAt = now()
      const { accounts } = await workerAccounts()
      const cutoff = addDays(now(), -config.inboxLookbackDays)
      let inserted = 0
      let seen = 0
      for (const account of accounts) {
        const items: InteractionItem[] = []
        if (["instagram", "facebook", "twitter", "bluesky", "reddit", "telegram"].includes(account.platform)) {
          assertQuota()
          const conversations = observe(await zernio.listConversations({ accountId: account.zernio_account_id, limit: config.maxConversationsPerAccount, sortOrder: "desc" })).data.data ?? []
          for (const conversation of conversations.filter((item) => !item.updatedTime || new Date(item.updatedTime) >= cutoff)) {
            assertQuota()
            const messages = observe(await zernio.listMessages(conversation.id, { accountId: account.zernio_account_id, limit: 50, sortOrder: "desc" })).data.messages ?? []
            for (const message of messages) {
              const item = normalizeRestMessage(message, account.zernio_account_id, conversation)
              if (item) items.push(item)
            }
          }
        }
        if (["instagram", "facebook", "threads", "youtube", "linkedin", "tiktok"].includes(account.platform)) {
          assertQuota()
          const posts = observe(await zernio.listCommentedPosts({ accountId: account.zernio_account_id, since: cutoff.toISOString(), limit: config.maxCommentedPostsPerAccount })).data.data ?? []
          for (const post of posts.filter((item) => !item.isAd && (item.commentCount ?? 0) > 0)) {
            assertQuota()
            const comments = observe(await zernio.listPostComments(post.id, { accountId: account.zernio_account_id, limit: 50 })).data.comments ?? []
            items.push(...normalizeRestComments(comments, account.zernio_account_id, account.platform, post.id))
          }
        }
        seen += items.length
        for (let index = 0; index < items.length; index += 200) {
          const result = await rpc<{ inserted: number }>("social_ingest_interactions", { p_items: items.slice(index, index + 200), p_source: "backfill" })
          inserted += result.inserted
        }
      }
      await recordRun(job, "inbox_backfill", "global", startedAt, { items_seen: seen, items_written: inserted })
      return { seen, inserted }
    },

    async "automations.sync"(job) {
      const startedAt = now()
      const { profiles } = await workerAccounts()
      let total = 0
      for (const profile of profiles) {
        assertQuota()
        const automations = observe(await zernio.listCommentAutomations(profile.zernio_profile_id)).data.automations ?? []
        total += automations.length
        await rpc("social_sync_provider_automations", {
          p_items: automations.map((automation) => ({
            id: automation.id ?? automation._id, accountId: automation.accountId, name: automation.name, trigger: automation.trigger,
            platformPostId: automation.platformPostId, isActive: automation.isActive, stats: automation.stats,
            keywords: automation.keywords, matchMode: automation.matchMode,
          })),
        })
      }
      await recordRun(job, "automations", "global", startedAt, { items_seen: total })
      return { automations: total }
    },

    async "webhook.process"() {
      const events = await rpc<Array<{ id: string; event_type: string; payload: Record<string, unknown> | null }>>("social_webhook_claim", { p_limit: 50 })
      const counts = { processed: 0, quarantined: 0, ignored: 0, failed: 0 }
      let needsInventory = false
      let needsDelta = false
      for (const event of events) {
        try {
          if (!event.payload || (event.payload as Record<string, unknown>).redacted) {
            await rpc("social_webhook_mark", { p_event_id: event.id, p_status: "ignored", p_error: "payload_redacted" })
            counts.ignored += 1
            continue
          }
          const normalized = normalizeWebhookEvent(event.payload)
          if (normalized.kind === "interactions") {
            const result = await rpc<{ inserted: number; quarantined: unknown[] }>("social_ingest_interactions", { p_items: normalized.items, p_source: "webhook" })
            const status = result.quarantined.length > 0 ? "quarantined" : "processed"
            await rpc("social_webhook_mark", { p_event_id: event.id, p_status: status, p_error: status === "quarantined" ? JSON.stringify(result.quarantined).slice(0, 500) : null })
            counts[status] += 1
          } else if (normalized.kind === "account") {
            needsInventory = true
            await rpc("social_webhook_mark", { p_event_id: event.id, p_status: "processed" })
            counts.processed += 1
          } else if (normalized.kind === "analytics_signal") {
            needsDelta = true
            await rpc("social_webhook_mark", { p_event_id: event.id, p_status: "processed" })
            counts.processed += 1
          } else {
            await rpc("social_webhook_mark", { p_event_id: event.id, p_status: "ignored", p_error: normalized.reason })
            counts.ignored += 1
          }
        } catch (error) {
          counts.failed += 1
          await rpc("social_webhook_mark", { p_event_id: event.id, p_status: "failed", p_error: error instanceof Error ? error.message : String(error) })
        }
      }
      const specs: Record<string, unknown>[] = []
      const bucket = now().toISOString().slice(0, 16)
      if (needsInventory) {
        specs.push({ kind: "inventory.reconcile", dedupe_key: `inventory:event:${bucket}`, priority: 15, window_hours: 1 })
        specs.push({ kind: "health.check", dedupe_key: `health:event:${bucket}`, priority: 15, window_hours: 1 })
      }
      if (needsDelta) {
        // El feed retiene los últimos segundos: leer un poco después de la señal.
        specs.push({ kind: "analytics.delta", dedupe_key: `delta:signal:${bucket}`, priority: 20, window_hours: 1,
          run_after: new Date(now().getTime() + 30_000).toISOString() })
      }
      if (specs.length) await rpc("social_schedule_jobs", { p_specs: specs })
      return { events: events.length, ...counts }
    },

    async "outbox.dispatch"() {
      const ids = await rpc<string[]>("social_outbox_pending", { p_limit: 10 })
      const results: Record<string, string> = {}
      for (const id of ids) {
        let action: { id: string; action_type: string; target_ref: Record<string, string>; request: Record<string, unknown>; created_by: string }
        try {
          action = await rpc("social_outbox_begin", { p_outbox_id: id })
        } catch (error) {
          results[id] = error instanceof SocialError ? error.code : "begin_failed"
          continue
        }
        results[id] = await executeOutbox(action)
      }
      return { dispatched: ids.length, results }
    },

    async "outbox.reconcile"() {
      const items = await rpc<Array<{ id: string; action_type: string; target_ref: Record<string, string>; request: Record<string, unknown>; created_at: string; updated_at: string }>>(
        "social_outbox_ambiguous", { p_limit: 10 })
      const outcome: Record<string, string> = {}
      for (const item of items) {
        const text = String(item.request.text ?? "").trim()
        try {
          let foundId: string | null = null
          if (item.action_type === "send_dm" && item.target_ref.conversation_id) {
            const messages = observe(await zernio.listMessages(item.target_ref.conversation_id, { accountId: item.target_ref.zernio_account_id, limit: 30, sortOrder: "desc" })).data.messages ?? []
            foundId = messages.find((message) => message.direction === "outgoing" && (message.message ?? "").trim() === text
              && (!message.createdAt || new Date(message.createdAt) >= new Date(new Date(item.created_at).getTime() - 60_000)))?.id ?? null
          } else if (item.action_type === "reply_comment" && item.target_ref.platform_post_id) {
            const comments = observe(await zernio.listPostComments(item.target_ref.platform_post_id, { accountId: item.target_ref.zernio_account_id, limit: 50 })).data.comments ?? []
            const all = comments.flatMap((comment) => [comment, ...(comment.replies ?? [])])
            foundId = all.find((comment) => comment.from?.isOwner && (comment.message ?? "").trim() === text)?.id ?? null
          }
          if (foundId) {
            await rpc("social_outbox_finish", { p_outbox_id: item.id, p_status: "sent", p_provider_reference: foundId, p_provider_result: { reconciled: true }, p_error: null })
            outcome[item.id] = "sent"
          } else if (now().getTime() - new Date(item.updated_at).getTime() > 30 * 60_000) {
            // Sin evidencia de envío tras 30 min: se declara fallido para que un
            // admin decida reenviar (nunca se reenvía automáticamente).
            await rpc("social_outbox_finish", { p_outbox_id: item.id, p_status: "failed", p_provider_reference: null, p_provider_result: { reconciled: true },
              p_error: "No se encontró el envío en el proveedor tras la conciliación; revisá antes de reenviar" })
            outcome[item.id] = "failed"
          } else {
            outcome[item.id] = "still_ambiguous"
          }
        } catch (error) {
          if (error instanceof QuotaReserveReached) throw error
          outcome[item.id] = "reconcile_error"
        }
      }
      return { reconciled: items.length, outcome }
    },

    async "internal.automations"() {
      return rpc("social_run_internal_automations")
    },

    async "retention.apply"() {
      return rpc("social_apply_payload_retention", { p_limit: 2000 })
    },
  }

  async function executeOutbox(action: { id: string; action_type: string; target_ref: Record<string, string>; request: Record<string, unknown>; created_by: string }) {
    const ref = action.target_ref
    const text = String(action.request.text ?? "")
    const finish = (status: string, reference: string | null, result: unknown, error: string | null) =>
      rpc("social_outbox_finish", { p_outbox_id: action.id, p_status: status, p_provider_reference: reference, p_provider_result: result, p_error: error })
    try {
      if (action.action_type === "send_dm") {
        const response = observe(await zernio.sendMessage(ref.conversation_id, { accountId: ref.zernio_account_id, message: text }, action.id))
        const reference = response.data.data?.messageId ?? response.data.data?.messageIds?.[0] ?? null
        await finish("sent", reference, { success: response.data.success ?? true }, null)
      } else if (action.action_type === "reply_comment") {
        const response = observe(await zernio.replyToComment(ref.platform_post_id, { accountId: ref.zernio_account_id, message: text, commentId: ref.comment_id }, action.id))
        await finish("sent", response.data.data?.commentId ?? null, { success: response.data.success ?? true }, null)
      } else if (action.action_type === "private_reply") {
        const response = observe(await zernio.privateReply(ref.platform_post_id, ref.comment_id, { accountId: ref.zernio_account_id, message: text }))
        await finish("sent", response.data.messageId ?? null, { status: response.data.status ?? "success" }, null)
      } else if (action.action_type.startsWith("automation_")) {
        const config = (action.request.config ?? {}) as Record<string, unknown>
        const name = String(action.request.name ?? "Automatización Quepia")
        let providerId = ref.zernio_automation_id ?? null
        let isActive = true
        if (action.action_type === "automation_create") {
          const response = observe(await zernio.createCommentAutomation(toZernioAutomationBody({
            name, config, zernioProfileId: ref.zernio_profile_id, zernioAccountId: ref.zernio_account_id, forCreate: true,
          })))
          providerId = String(response.data.automation?.id ?? response.data.automation?._id ?? "")
        } else if (action.action_type === "automation_pause") {
          observe(await zernio.updateCommentAutomation(String(providerId), { isActive: false }))
          isActive = false
        } else {
          observe(await zernio.updateCommentAutomation(String(providerId), {
            ...toZernioAutomationBody({ name, config, forCreate: false }), isActive: true,
          }))
        }
        await rpc("social_automation_apply_provider_result", {
          p_automation_id: ref.automation_id, p_ok: true, p_zernio_automation_id: providerId, p_is_active: isActive, p_actor: action.created_by, p_error: null,
        })
        await finish("sent", providerId, { automation: providerId, is_active: isActive }, null)
      } else {
        await finish("failed", null, null, "Acción desconocida")
        return "failed"
      }
      return "sent"
    } catch (error) {
      if (error instanceof ZernioAdapterError) {
        if (error.ambiguous) {
          await finish("ambiguous", null, { kind: error.kind, status: error.status }, error.message)
          return "ambiguous"
        }
        if (error.kind === "rate_limited" || error.kind === "unavailable") {
          await finish("pending", null, null, `Reintento diferido: ${error.message}`)
          return "deferred"
        }
        if (action.action_type.startsWith("automation_")) {
          await rpc("social_automation_apply_provider_result", {
            p_automation_id: ref.automation_id, p_ok: false, p_zernio_automation_id: null, p_is_active: false, p_actor: action.created_by, p_error: error.message,
          })
        }
        await finish("failed", null, { kind: error.kind, status: error.status, code: error.code, details: error.details ?? null }, error.message)
        return "failed"
      }
      await finish("ambiguous", null, null, error instanceof Error ? error.message : String(error))
      return "ambiguous"
    }
  }

  // ------------------------------------------------------------------
  // Programación periódica y ejecución acotada
  // ------------------------------------------------------------------

  function recurringSpecs(at: Date) {
    const day = dateOnly(at)
    const hour = at.toISOString().slice(0, 13)
    const quarter = `${day}-${Math.floor(at.getUTCHours() / 6)}`
    const tenMinutes = `${at.toISOString().slice(0, 15)}`
    return [
      { kind: "outbox.dispatch", dedupe_key: `outbox:${tenMinutes}`, window_hours: 1 },
      { kind: "webhook.process", dedupe_key: `webhooks:${tenMinutes}`, window_hours: 1 },
      { kind: "outbox.reconcile", dedupe_key: `outbox-reconcile:${tenMinutes}`, window_hours: 1 },
      { kind: "analytics.delta", dedupe_key: `delta:${tenMinutes}`, window_hours: 1 },
      { kind: "internal.automations", dedupe_key: `internal:${tenMinutes}`, window_hours: 1 },
      { kind: "health.check", dedupe_key: `health:${hour}`, window_hours: 2 },
      { kind: "inventory.reconcile", dedupe_key: `inventory:${hour}`, window_hours: 2 },
      { kind: "automations.sync", dedupe_key: `automations:${hour}`, window_hours: 2 },
      { kind: "followers.daily", dedupe_key: `followers:${day}`, window_hours: 30 },
      { kind: "ig_insights.refresh", dedupe_key: `ig-insights:${day}`, window_hours: 30 },
      { kind: "retention.apply", dedupe_key: `retention:${day}`, window_hours: 30 },
      { kind: "timeline.backfill", dedupe_key: `timeline:${quarter}`, window_hours: 8 },
      { kind: "inbox.backfill", dedupe_key: `inbox:${quarter}`, window_hours: 8 },
    ].map((spec) => ({ ...spec, priority: JOB_PRIORITY[spec.kind] ?? 50 }))
  }

  async function scheduleRecurring() {
    return rpc("social_schedule_jobs", { p_specs: recurringSpecs(now()) })
  }

  async function runOnce(options: { workerId: string; budgetMs?: number; kinds?: string[]; schedule?: boolean }) {
    const deadline = Date.now() + (options.budgetMs ?? 45_000)
    if (options.schedule !== false) await scheduleRecurring()
    const summary: Array<Record<string, unknown>> = []
    while (Date.now() < deadline) {
      const claimed = await rpc<{ jobs: Job[]; recovered_leases: number }>("social_claim_jobs", {
        p_worker: options.workerId, p_limit: 3, p_lease_seconds: 240, p_kinds: options.kinds ?? null,
      })
      if (claimed.jobs.length === 0) break
      for (const job of claimed.jobs) {
        const started = Date.now()
        const handler = handlers[job.kind]
        try {
          if (!handler) throw new SocialError(400, "unknown_job", `Trabajo desconocido: ${job.kind}`)
          // Respuestas humanas y trabajo local no esperan: el resto respeta la reserva.
          if (!LOCAL_OR_PRIORITY_JOBS.has(job.kind)) assertQuota()
          const result = await handler(job)
          await rpc("social_complete_job", { p_job_id: job.id, p_worker: options.workerId, p_result: result })
          summary.push({ kind: job.kind, status: "succeeded", ms: Date.now() - started })
          log("job.succeeded", { kind: job.kind, job: job.id, correlation_id: job.correlation_id, ms: Date.now() - started })
        } catch (error) {
          const quota = error instanceof QuotaReserveReached
          const adapterError = error instanceof ZernioAdapterError ? error : null
          const terminal = Boolean(adapterError?.terminal) || (error instanceof SocialError && error.code === "unknown_job")
          const retryAfter = quota ? 60 : adapterError?.retryAfterSeconds
          await rpc("social_fail_job", {
            p_job_id: job.id, p_worker: options.workerId,
            p_error: error instanceof Error ? error.message : String(error),
            p_retry_after_seconds: retryAfter ?? null, p_terminal: terminal,
          }).catch(() => undefined)
          summary.push({ kind: job.kind, status: terminal ? "failed" : "retry", error: error instanceof Error ? error.message : String(error) })
          log("job.failed", { kind: job.kind, job: job.id, correlation_id: job.correlation_id, terminal, error_kind: adapterError?.kind ?? (quota ? "quota_reserve" : "internal") })
          if (quota) return { summary, stoppedFor: "quota_reserve" }
        }
      }
    }
    return { summary }
  }

  return { runOnce, scheduleRecurring, recurringSpecs, handlers, executeOutbox }
}
