import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { sendEmail } from "@/lib/sistema/email-service"

export const dynamic = "force-dynamic"

// Postgres no puede mandar mail, así que el MCP encola el aviso al comentar una
// tarea y esta ruta vacía la cola con Resend. La notificación dentro de la app
// ya se creó en la misma transacción: acá sólo falta el correo.
const BATCH_SIZE = 25
const MAX_ATTEMPTS = 3

type OutboxRow = {
  id: string
  user_id: string
  title: string
  content: string | null
  link: string | null
  attempts: number
  recipient?: {
    email: string | null
    nombre: string | null
    is_active: boolean | null
    deleted_at: string | null
  } | null
}

type MaybeArray<T> = T | T[] | null | undefined

function firstRelation<T>(value: MaybeArray<T>) {
  return Array.isArray(value) ? value[0] || null : value || null
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://quepia.com"
}

function absoluteUrl(link: string | null) {
  if (!link) return `${getBaseUrl()}/sistema`
  return link.startsWith("http") ? link : `${getBaseUrl()}${link}`
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured" },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const supabase = createAdminClient()

    const { data: rawPending, error: pendingError } = await supabase
      .from("sistema_notification_email_outbox")
      .select(`
        id,
        user_id,
        title,
        content,
        link,
        attempts,
        recipient:sistema_users!sistema_notification_email_outbox_user_id_fkey(
          email,
          nombre,
          is_active,
          deleted_at
        )
      `)
      .eq("status", "pending")
      .lt("attempts", MAX_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE)

    if (pendingError) throw pendingError

    const pending: OutboxRow[] = (rawPending || []).map((row) => ({
      ...(row as unknown as OutboxRow),
      recipient: firstRelation(
        (row as { recipient?: MaybeArray<OutboxRow["recipient"]> }).recipient
      ),
    }))

    let sent = 0
    let failed = 0

    for (const entry of pending) {
      const recipient = entry.recipient
      const inactive =
        !recipient?.email || recipient.is_active === false || recipient.deleted_at

      // Un destinatario dado de baja no es un error a reintentar: se cierra.
      if (inactive) {
        await supabase
          .from("sistema_notification_email_outbox")
          .update({
            status: "failed",
            attempts: entry.attempts + 1,
            last_error: "recipient_unavailable",
          })
          .eq("id", entry.id)
        failed += 1
        continue
      }

      const result = await sendEmail({
        type: "general_notification",
        to: recipient.email as string,
        data: {
          recipientName: recipient.nombre || "Equipo",
          title: entry.title,
          content: entry.content || "",
          actionUrl: absoluteUrl(entry.link),
          actionText: "Ver la tarea",
        },
      })

      if (result?.success) {
        await supabase
          .from("sistema_notification_email_outbox")
          .update({
            status: "sent",
            attempts: entry.attempts + 1,
            sent_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", entry.id)
        sent += 1
        continue
      }

      const attempts = entry.attempts + 1
      await supabase
        .from("sistema_notification_email_outbox")
        .update({
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          attempts,
          last_error: String(result?.error ?? "send_failed").slice(0, 500),
        })
        .eq("id", entry.id)
      failed += 1
    }

    return NextResponse.json({
      success: true,
      processed: pending.length,
      sent,
      failed,
    })
  } catch (error) {
    console.error("[NotificationEmails] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: "Unexpected error" },
      { status: 500 }
    )
  }
}
