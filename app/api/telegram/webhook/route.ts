import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { notifyTelegramReplyFeedback } from '@/lib/sistema/actions/notifications'
import { replyToTelegramChat } from '@/lib/sistema/telegram-service'
import { dispatchTelegramCommand } from '@/lib/sistema/telegram-commands'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TelegramUser {
  id?: number | string
  is_bot?: boolean
  first_name?: string
  last_name?: string
  username?: string
}

interface TelegramChat {
  id?: number | string
}

interface TelegramMessage {
  message_id?: number | string
  text?: string
  caption?: string
  from?: TelegramUser
  chat?: TelegramChat
  reply_to_message?: {
    message_id?: number | string
  } | null
}

interface TelegramUpdate {
  update_id?: number | string
  message?: TelegramMessage
  edited_message?: TelegramMessage
}

function normalizeTelegramId(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getTelegramWebhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || ''
}

function getConfiguredChatId() {
  return process.env.TELEGRAM_CHAT_ID?.trim() || ''
}

function getAllowedSenderIds() {
  const raw = process.env.TELEGRAM_ALLOWED_USER_IDS?.trim() || ''
  if (!raw) return null

  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return values.length > 0 ? new Set(values) : null
}

function getTelegramMessageContent(message?: TelegramMessage | null) {
  const value = typeof message?.text === 'string'
    ? message.text
    : typeof message?.caption === 'string'
      ? message.caption
      : ''

  return value.trim()
}

function getTelegramSenderName(message?: TelegramMessage | null) {
  const parts = [
    message?.from?.first_name?.trim(),
    message?.from?.last_name?.trim(),
  ].filter(Boolean)

  if (parts.length > 0) {
    return parts.join(' ')
  }

  if (message?.from?.username?.trim()) {
    return `@${message.from.username.trim()}`
  }

  return 'Telegram'
}

async function updateInboundStatus(
  inboundId: string,
  values: Record<string, unknown>
) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('sistema_telegram_inbound_updates')
    .update(values)
    .eq('id', inboundId)

  if (error) {
    console.error('Error updating Telegram inbound status:', error)
  }
}

export async function POST(request: Request) {
  const configuredChatId = getConfiguredChatId()
  const webhookSecret = getTelegramWebhookSecret()
  const incomingSecret = request.headers.get('x-telegram-bot-api-secret-token')?.trim() || ''

  if (webhookSecret && incomingSecret !== webhookSecret) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  if (!configuredChatId) {
    return NextResponse.json({ ok: false, error: 'Telegram chat is not configured.' }, { status: 503 })
  }

  let update: TelegramUpdate

  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 })
  }

  const message = update.message || update.edited_message
  const updateId = normalizeTelegramId(update.update_id)

  if (!updateId) {
    return NextResponse.json({ ok: true, ignored: 'missing_update_id' })
  }

  const chatId = normalizeTelegramId(message?.chat?.id)
  const messageId = normalizeTelegramId(message?.message_id)
  const replyToMessageId = normalizeTelegramId(message?.reply_to_message?.message_id)
  const senderId = normalizeTelegramId(message?.from?.id)
  const senderName = getTelegramSenderName(message)
  const content = getTelegramMessageContent(message)
  const now = new Date().toISOString()

  const supabase = createAdminClient()
  const { data: inboundRow, error: inboundInsertError } = await supabase
    .from('sistema_telegram_inbound_updates')
    .insert({
      update_id: updateId,
      chat_id: chatId || null,
      message_id: messageId || null,
      reply_to_message_id: replyToMessageId || null,
      sender_id: senderId || null,
      sender_name: senderName,
      content: content || null,
      raw_update: update,
    })
    .select('id')
    .single()

  if (inboundInsertError?.code === '23505') {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  if (inboundInsertError || !inboundRow?.id) {
    console.error('Error inserting Telegram inbound update:', inboundInsertError)
    return NextResponse.json({ ok: false, error: 'Could not register Telegram update.' }, { status: 500 })
  }

  const inboundId = inboundRow.id
  const allowedSenderIds = getAllowedSenderIds()

  if (!message) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Update does not contain a supported message payload.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'missing_message' })
  }

  if (chatId !== configuredChatId) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Message does not belong to the configured Telegram chat.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'chat_not_allowed' })
  }

  if (message.from?.is_bot) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Bot messages are ignored.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'bot_sender' })
  }

  // ─── Slash command routing ─────────────────────────────────────────────────

  if (content.startsWith('/')) {
    if (allowedSenderIds && (!senderId || !allowedSenderIds.has(senderId))) {
      await replyToTelegramChat(chatId, '🚫 No tenés permiso para usar comandos.')
      await updateInboundStatus(inboundId, {
        status: 'ignored',
        error_message: 'Sender not allowed for commands.',
        processed_at: now,
      })
      return NextResponse.json({ ok: true, ignored: 'sender_not_allowed' })
    }

    try {
      const response = await dispatchTelegramCommand(content)
      await replyToTelegramChat(chatId, response)
      await updateInboundStatus(inboundId, { status: 'processed', processed_at: now })
      return NextResponse.json({ ok: true, status: 'command_processed' })
    } catch (err) {
      console.error('Telegram command error:', err)
      await replyToTelegramChat(chatId, '❌ Error interno al procesar el comando.')
      await updateInboundStatus(inboundId, {
        status: 'failed',
        error_message: err instanceof Error ? err.message : 'Unknown command error',
        processed_at: now,
      })
      return NextResponse.json({ ok: true, status: 'command_failed' })
    }
  }

  // ─── Existing asset feedback reply flow ────────────────────────────────────

  if (allowedSenderIds && (!senderId || !allowedSenderIds.has(senderId))) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Sender is not allowed to create feedback from Telegram.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'sender_not_allowed' })
  }

  if (!replyToMessageId) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Only replies to tracked Telegram messages are processed.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'missing_reply_to' })
  }

  if (!content) {
    await updateInboundStatus(inboundId, {
      status: 'ignored',
      error_message: 'Telegram reply content is empty.',
      processed_at: now,
    })
    return NextResponse.json({ ok: true, ignored: 'empty_content' })
  }

  const result = await notifyTelegramReplyFeedback({
    chatId,
    replyToMessageId,
    authorName: senderName,
    content,
  })

  if (result.success) {
    await updateInboundStatus(inboundId, {
      status: 'processed',
      linked_message_id: result.linkedMessageId || null,
      comment_id: result.commentId || null,
      processed_at: now,
    })

    return NextResponse.json({
      ok: true,
      status: 'processed',
      taskId: result.taskId || null,
      commentId: result.commentId || null,
    })
  }

  await updateInboundStatus(inboundId, {
    status: result.ignored ? 'ignored' : 'failed',
    error_message: result.error || 'Unknown Telegram feedback processing error.',
    processed_at: now,
  })

  return NextResponse.json({
    ok: true,
    status: result.ignored ? 'ignored' : 'failed',
    error: result.error || null,
  })
}
