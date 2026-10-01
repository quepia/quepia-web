import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { sendTelegramTextNotice } from "@/lib/sistema/telegram-service"
import { syncPendingPublications } from "./sync-publications"

type Notice = { id: string; lease_token: string; attempts: number; platform: string; payload: { task?: string; project?: string; account?: string; published_at?: string; url?: string } }

export function publicationTelegramMessage(notice: Pick<Notice, "platform" | "payload">) {
  const { payload } = notice
  const published = payload.published_at && Number.isFinite(Date.parse(payload.published_at))
    ? new Date(payload.published_at).toLocaleString("es-AR", { timeZone: "America/Argentina/Cordoba", hour12: false }) : null
  return {
    headline: "✅ Publicación confirmada",
    lines: [
      `Cuenta: ${payload.account || payload.project || "Cuenta social"}`,
      `Red: ${notice.platform}`,
      ...(payload.task ? [`Tarea: ${payload.task}`] : []),
      ...(payload.project ? [`Proyecto: ${payload.project}`] : []),
      ...(published ? [`Publicada: ${published}`] : []),
      ...(payload.url && /^https:\/\//i.test(payload.url) ? [`Ver publicación: ${payload.url}`] : []),
    ],
  }
}

export async function dispatchPublicationTelegramNotices() {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) throw new Error("Telegram no configurado")
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("claim_publication_telegram_notices", { p_limit: 3 })
  if (error) throw error
  const counts = { sent: 0, failed: 0 }
  await Promise.all(((data || []) as Notice[]).map(async (notice) => {
    const result = await sendTelegramTextNotice(publicationTelegramMessage(notice))
    const sent = result.sent === 1 && result.failed === 0
    const { error: updateError } = await admin.from("sistema_publication_telegram_notices").update({
      status: sent ? "sent" : "pending",
      sent_at: sent ? new Date().toISOString() : null,
      next_attempt_at: new Date(Date.now() + Math.min(3600, 30 * 2 ** Math.min(notice.attempts, 7)) * 1000).toISOString(),
      error_message: sent ? null : result.errors.join("; ").slice(0, 1000),
      lease_token: null,
    }).eq("id", notice.id).eq("lease_token", notice.lease_token)
    if (updateError) throw updateError
    counts[sent ? "sent" : "failed"]++
  }))
  return counts
}

export async function processPublicationTelegramNotifications() {
  const sync = await syncPendingPublications()
  const delivery = await dispatchPublicationTelegramNotices()
  return { checked: sync.checked, unverified: sync.failed, ...delivery }
}
