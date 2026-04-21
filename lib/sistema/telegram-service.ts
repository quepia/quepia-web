'use server'

import { createSignedUrl } from '@/lib/sistema/assets-storage'

const TELEGRAM_MAX_FILE_BYTES = 50 * 1024 * 1024
const TELEGRAM_SIGNED_URL_TTL = 60 * 60 * 24 * 7 // 7 days
const TELEGRAM_CAPTION_LIMIT = 1024
const TELEGRAM_MESSAGE_LIMIT = 4096

interface TelegramAssetPayload {
  assetId: string
  assetVersionId: string
  assetName: string
  assetType: string | null
  versionNumber: number
  fileUrl: string
  storagePath: string | null
  fileSize: number | null
  originalFilename: string | null
}

interface SendTelegramAssetDeliveryParams {
  assets: TelegramAssetPayload[]
  replyToMessageId?: string
}

interface SendTelegramAssetDeliveryResult {
  sent: number
  linkFallbacks: number
  failed: number
  errors: string[]
  messages: TelegramSentMessageRecord[]
}

interface SendTelegramNoticeResult {
  sent: number
  failed: number
  errors: string[]
}

interface SendTelegramTaskSummaryParams {
  projectName: string
  taskTitle: string
  socialCopy?: string | null
}

interface SendTelegramTaskSummaryResult {
  sent: number
  failed: number
  errors: string[]
  message?: TelegramSentMessageRecord
}

interface TelegramApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
}

interface TelegramApiMessage {
  message_id: number | string
  chat?: {
    id?: number | string
  } | null
}

export interface TelegramSentMessageRecord {
  chatId: string
  messageId: string
  assetId?: string
  assetVersionId?: string
  method: 'message' | 'document'
  scope: 'asset' | 'task_summary'
}

function getTelegramConfig() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || ''
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim() || ''

  return {
    botToken,
    chatId,
    isConfigured: Boolean(botToken && chatId),
  }
}

function trimTelegramText(value: string, limit: number) {
  if (value.length <= limit) return value
  return `${value.slice(0, limit - 3)}...`
}

function trimCaption(value: string) {
  return trimTelegramText(value, TELEGRAM_CAPTION_LIMIT)
}

function trimMessage(value: string) {
  return trimTelegramText(value, TELEGRAM_MESSAGE_LIMIT)
}

function getAssetDisplayName(asset: TelegramAssetPayload) {
  return asset.assetName?.trim() || asset.originalFilename?.trim() || 'Asset'
}

function buildAssetDebugLabel(asset: TelegramAssetPayload) {
  return `${getAssetDisplayName(asset)} · v${asset.versionNumber}`
}

function buildTaskSummaryMessage(params: SendTelegramTaskSummaryParams) {
  const lines = [
    'Entrega lista para enviar',
    `Cliente: ${params.projectName}`,
    `Tarea: ${params.taskTitle}`,
  ]

  const socialCopy = params.socialCopy?.trim()
  if (socialCopy) {
    lines.push('', 'Copy / SEO', socialCopy)
  }

  lines.push('', 'Si queres dejar feedback, responde este mensaje.')

  return trimMessage(lines.join('\n'))
}

function buildFallbackMessage(params: {
  asset: TelegramAssetPayload
  assetUrl: string
}) {
  return trimMessage([
    `Asset: ${getAssetDisplayName(params.asset)}`,
    params.assetUrl,
  ].join('\n'))
}

async function callTelegramApi<T>(
  method: string,
  init: { body: BodyInit; headers?: Record<string, string> }
) {
  const { botToken } = getTelegramConfig()
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    body: init.body,
    headers: init.headers,
    cache: 'no-store',
  })

  let payload: TelegramApiResponse<T> | null = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram ${method} failed with status ${response.status}`)
  }

  return payload.result as T
}

async function sendTelegramMessage(chatId: string, text: string, replyToMessageId?: string) {
  const body = new URLSearchParams()
  body.set('chat_id', chatId)
  body.set('text', text)
  body.set('disable_web_page_preview', 'true')

  if (replyToMessageId) {
    body.set('reply_to_message_id', replyToMessageId)
  }

  return callTelegramApi<TelegramApiMessage>('sendMessage', {
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
  })
}

async function sendTelegramDocument(
  chatId: string,
  documentUrl: string,
  caption?: string,
  replyToMessageId?: string
) {
  const body = new FormData()
  body.append('chat_id', chatId)
  body.append('document', documentUrl)

  if (caption?.trim()) {
    body.append('caption', caption)
  }

  if (replyToMessageId) {
    body.append('reply_to_message_id', replyToMessageId)
  }

  return callTelegramApi<TelegramApiMessage>('sendDocument', { body })
}

export async function replyToTelegramChat(chatId: string, text: string) {
  const { botToken, isConfigured } = getTelegramConfig()
  if (!isConfigured || !botToken) return

  try {
    await sendTelegramMessage(chatId, trimMessage(text))
  } catch (error) {
    console.error('replyToTelegramChat error:', error)
  }
}

export async function sendTelegramTextNotice(params: {
  headline: string
  lines: string[]
}): Promise<SendTelegramNoticeResult> {
  const { botToken, chatId, isConfigured } = getTelegramConfig()

  if (!isConfigured || !botToken || !chatId) {
    return {
      sent: 0,
      failed: 1,
      errors: ['Telegram no esta configurado. Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.'],
    }
  }

  const text = trimMessage([params.headline, ...params.lines.filter(Boolean)].join('\n'))

  try {
    await sendTelegramMessage(chatId, text)
    return { sent: 1, failed: 0, errors: [] }
  } catch (error) {
    return {
      sent: 0,
      failed: 1,
      errors: [
        `Telegram: no se pudo enviar el aviso de texto (${error instanceof Error ? error.message : 'error desconocido'}).`,
      ],
    }
  }
}

export async function sendTelegramTaskSummary(
  params: SendTelegramTaskSummaryParams
): Promise<SendTelegramTaskSummaryResult> {
  const { botToken, chatId, isConfigured } = getTelegramConfig()

  if (!isConfigured || !botToken || !chatId) {
    return {
      sent: 0,
      failed: 1,
      errors: ['Telegram no esta configurado. Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.'],
    }
  }

  try {
    const message = await sendTelegramMessage(chatId, buildTaskSummaryMessage(params))

    return {
      sent: 1,
      failed: 0,
      errors: [],
      message: {
        chatId: String(message.chat?.id ?? chatId),
        messageId: String(message.message_id),
        method: 'message',
        scope: 'task_summary',
      },
    }
  } catch (error) {
    return {
      sent: 0,
      failed: 1,
      errors: [
        `Telegram: no se pudo enviar el resumen de la tarea (${error instanceof Error ? error.message : 'error desconocido'}).`,
      ],
    }
  }
}

async function resolveAssetUrl(asset: TelegramAssetPayload) {
  if (asset.storagePath) {
    return createSignedUrl(asset.storagePath, TELEGRAM_SIGNED_URL_TTL)
  }

  if (/^https?:\/\//i.test(asset.fileUrl)) {
    return asset.fileUrl
  }

  return null
}

export async function sendTelegramAssetDelivery(
  params: SendTelegramAssetDeliveryParams
): Promise<SendTelegramAssetDeliveryResult> {
  const { botToken, chatId, isConfigured } = getTelegramConfig()
  const assets = params.assets || []
  const errors: string[] = []
  const messages: TelegramSentMessageRecord[] = []
  let sent = 0
  let linkFallbacks = 0
  let failed = 0

  if (assets.length === 0) {
    return { sent, linkFallbacks, failed, errors, messages }
  }

  if (!isConfigured || !botToken || !chatId) {
    return {
      sent,
      linkFallbacks,
      failed: assets.length,
      errors: ['Telegram no esta configurado. Falta TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.'],
      messages,
    }
  }

  for (const asset of assets) {
    const assetLabel = buildAssetDebugLabel(asset)

    try {
      const assetUrl = await resolveAssetUrl(asset)
      if (!assetUrl) {
        failed += 1
        errors.push(`Telegram: no se pudo generar un acceso para "${assetLabel}".`)
        continue
      }

      const requiresLinkFallback = !asset.storagePath || Boolean(asset.fileSize && asset.fileSize > TELEGRAM_MAX_FILE_BYTES)

      if (requiresLinkFallback) {
        const reason = !asset.storagePath
          ? 'el asset usa una URL externa'
          : 'el archivo supera 50 MB'

        const fallbackMsg = await sendTelegramMessage(
          chatId,
          buildFallbackMessage({ asset, assetUrl }),
          params.replyToMessageId
        )

        messages.push({
          chatId: String(fallbackMsg.chat?.id ?? chatId),
          messageId: String(fallbackMsg.message_id),
          assetId: asset.assetId,
          assetVersionId: asset.assetVersionId,
          method: 'message',
          scope: 'asset',
        })

        linkFallbacks += 1
        errors.push(`Telegram: "${assetLabel}" se envio como link porque ${reason}.`)
        continue
      }

      try {
        const docMsg = await sendTelegramDocument(
          chatId,
          assetUrl,
          trimCaption(getAssetDisplayName(asset)),
          params.replyToMessageId
        )

        messages.push({
          chatId: String(docMsg.chat?.id ?? chatId),
          messageId: String(docMsg.message_id),
          assetId: asset.assetId,
          assetVersionId: asset.assetVersionId,
          method: 'document',
          scope: 'asset',
        })

        sent += 1
      } catch (error) {
        const retryMsg = await sendTelegramMessage(
          chatId,
          buildFallbackMessage({ asset, assetUrl }),
          params.replyToMessageId
        )

        messages.push({
          chatId: String(retryMsg.chat?.id ?? chatId),
          messageId: String(retryMsg.message_id),
          assetId: asset.assetId,
          assetVersionId: asset.assetVersionId,
          method: 'message',
          scope: 'asset',
        })

        linkFallbacks += 1
        errors.push(
          `Telegram: "${assetLabel}" se envio como link tras fallar el adjunto (${error instanceof Error ? error.message : 'error desconocido'}).`
        )
      }
    } catch (error) {
      failed += 1
      errors.push(
        `Telegram: no se pudo enviar "${assetLabel}" (${error instanceof Error ? error.message : 'error desconocido'}).`
      )
    }
  }

  return { sent, linkFallbacks, failed, errors, messages }
}
