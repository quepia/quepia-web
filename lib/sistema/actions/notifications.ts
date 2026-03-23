'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { notifyUser } from '@/lib/sistema/notifications'
import { sendEmail } from '@/lib/sistema/email-service'
import { createClientDirectLink, getClientBaseUrl } from '@/lib/sistema/auth/client-session'
import { sendTelegramAssetDelivery, sendTelegramTextNotice, type TelegramSentMessageRecord } from '@/lib/sistema/telegram-service'

type NotificationType = 'mention' | 'assignment' | 'approval_request' | 'status_change' | 'comment' | 'system'

interface SendNotificationParams {
    userId: string
    actorId?: string
    type: NotificationType
    title: string
    content?: string
    link?: string
    data?: Record<string, unknown>
}

interface ResolvedClientAccess {
    project_id: string
    nombre?: string | null
}

interface ExternalTaskCommentParams {
    taskId?: string | null
    assetId?: string | null
    assetVersionId?: string | null
    authorName: string
    content: string
    source: 'asset_feedback' | 'asset_status' | 'telegram_feedback'
    isClient?: boolean
}

interface PersistTelegramMessageLinksParams {
    projectId: string
    taskId: string
    actorUserId: string
    headline?: string
    messages: TelegramSentMessageRecord[]
}

async function resolveClientAccessByToken(supabase: ReturnType<typeof createAdminClient>, token: string): Promise<ResolvedClientAccess | null> {
    const { data: v1Access } = await supabase
        .from('sistema_client_access')
        .select('project_id, nombre')
        .eq('access_token', token)
        .single()

    if (v1Access) {
        return v1Access
    }

    if (token.length !== 36) {
        return null
    }

    const { data: session } = await supabase
        .from('sistema_client_sessions')
        .select('client_access_id')
        .eq('id', token)
        .single()

    if (!session?.client_access_id) {
        return null
    }

    const { data: v2Access } = await supabase
        .from('sistema_client_access')
        .select('project_id, nombre')
        .eq('id', session.client_access_id)
        .single()

    return v2Access || null
}

async function mirrorExternalCommentIntoTask(
    supabase: ReturnType<typeof createAdminClient>,
    params: ExternalTaskCommentParams
): Promise<string | null> {
    if (!params.taskId) return null

    const { data, error } = await supabase
        .from('sistema_comments')
        .insert({
            task_id: params.taskId,
            user_id: null,
            author_name: params.authorName,
            is_client: params.isClient ?? true,
            source: params.source,
            asset_id: params.assetId || null,
            asset_version_id: params.assetVersionId || null,
            contenido: params.content,
        })
        .select('id')
        .single()

    if (error) {
        console.error('Error mirroring external comment into task:', error)
        return null
    }

    return data?.id || null
}

async function getProjectNotificationRecipients(
    supabase: ReturnType<typeof createAdminClient>,
    projectId: string
) {
    const { data: members } = await supabase
        .from('sistema_project_members')
        .select('user_id')
        .eq('project_id', projectId)

    const { data: admins } = await supabase
        .from('sistema_users')
        .select('id')
        .eq('role', 'admin')

    return Array.from(
        new Set([
            ...(members?.map((member) => member.user_id) || []),
            ...(admins?.map((admin) => admin.id) || []),
        ].filter((value): value is string => Boolean(value)))
    )
}

async function persistTelegramMessageLinks(
    supabase: ReturnType<typeof createAdminClient>,
    params: PersistTelegramMessageLinksParams
) {
    const uniqueMessages = Array.from(
        new Map(
            (params.messages || []).map((message) => [
                `${message.chatId}:${message.messageId}`,
                message,
            ])
        ).values()
    )

    if (uniqueMessages.length === 0) {
        return { success: true as const }
    }

    const { error } = await supabase
        .from('sistema_telegram_message_links')
        .upsert(
            uniqueMessages.map((message) => ({
                chat_id: message.chatId,
                message_id: message.messageId,
                telegram_method: message.method,
                project_id: params.projectId,
                task_id: params.taskId,
                asset_id: message.assetId,
                asset_version_id: message.assetVersionId,
                actor_user_id: params.actorUserId,
                headline: params.headline || null,
            })),
            { onConflict: 'chat_id,message_id' }
        )

    if (error) {
        console.error('Error persisting Telegram message links:', error)
        return { success: false as const, error: error.message }
    }

    return { success: true as const }
}

export async function sendNotification(params: SendNotificationParams) {
    try {
        const supabase = await createClient()

        // Retrieve the user to verify existence (and optionally their settings, though notifyUser handles checks)
        const { data: user, error } = await supabase
            .from('sistema_users')
            .select('id')
            .eq('id', params.userId)
            .single()

        if (error || !user) {
            console.error('User not found for notification:', params.userId)
            return { success: false, error: 'User not found' }
        }

        // Call the internal notification logic
        await notifyUser({
            userId: params.userId,
            actorId: params.actorId || undefined,
            type: params.type,
            title: params.title,
            content: params.content,
            link: params.link,
            data: params.data,
        })

        return { success: true }
    } catch (error) {
        console.error('Error sending notification:', error)
        return { success: false, error: 'Internal server error' }
    }
}

export async function notifyTaskComment(taskId: string, content: string, authorId: string) {
    try {
        const supabase = await createClient()

        // Get task details and project members
        const { data: task } = await supabase
            .from('sistema_tasks')
            .select(`
        *,
        project:sistema_projects(nombre, id),
        assignee:sistema_users(id)
      `)
            .eq('id', taskId)
            .single()

        if (!task) return { success: false, error: 'Task not found' }

        // Notify assignee if distinct from author
        if (task.assignee?.id && task.assignee.id !== authorId) {
            await notifyUser({
                userId: task.assignee.id,
                actorId: authorId,
                type: 'comment',
                title: `Nuevo comentario en: ${task.titulo}`,
                content: content,
                link: `/sistema?taskId=${taskId}`,
                data: { taskId, projectId: task.project_id }
            })
        }

        return { success: true }
    } catch (error) {
        console.error('Error notifying task comment:', error)
        return { success: false, error: 'Internal server error' }
    }
}

export async function notifyClientFeedback(token: string, assetVersionId: string, content: string, authorName: string) {
    try {
        const supabase = createAdminClient()

        const clientAccess = await resolveClientAccessByToken(supabase, token)

        if (!clientAccess) return { success: false, error: 'Invalid token' }

        // 2. Get Asset info
        const { data: version } = await supabase
            .from('sistema_asset_versions')
            .select(`
            *,
            asset:sistema_assets(nombre, id, task_id)
        `)
            .eq('id', assetVersionId)
            .single()

        if (!version) return { success: false, error: 'Asset not found' }

        const taskCommentContent = `Feedback en "${version.asset?.nombre || 'Asset'}": ${content}`
        await mirrorExternalCommentIntoTask(supabase, {
            taskId: version.asset?.task_id,
            assetId: version.asset?.id,
            assetVersionId,
            authorName,
            content: taskCommentContent,
            source: 'asset_feedback',
        })

        const uniqueRecipients = await getProjectNotificationRecipients(supabase, clientAccess.project_id)

        // Send notifications
        await Promise.all(uniqueRecipients.map(userId =>
            notifyUser({
                userId,
                type: 'comment',
                title: `Feedback del Cliente: ${authorName}`,
                content: `Nuevo comentario en "${version.asset?.nombre || 'Asset'}": ${content}`,
                link: version.asset?.task_id ? `/sistema?taskId=${version.asset.task_id}` : `/sistema`,
                data: {
                    projectId: clientAccess.project_id,
                    assetId: version.asset?.id,
                    assetVersionId,
                    taskId: version.asset?.task_id,
                }
            })
        ))

        return { success: true }
    } catch (error) {
        console.error('Error notifying client feedback:', error)
        return { success: false, error: 'Internal server error' }
    }
}

export async function notifyTelegramReplyFeedback(params: {
    chatId: string
    replyToMessageId: string
    authorName: string
    content: string
}) {
    try {
        const trimmedContent = params.content.trim()
        if (!trimmedContent) {
            return { success: false, ignored: true, error: 'Empty Telegram reply content.' }
        }

        const supabase = createAdminClient()

        const { data: telegramMessage, error: telegramMessageError } = await supabase
            .from('sistema_telegram_message_links')
            .select('id, project_id, task_id, asset_id, asset_version_id')
            .eq('chat_id', params.chatId)
            .eq('message_id', params.replyToMessageId)
            .single()

        if (telegramMessageError || !telegramMessage) {
            return { success: false, ignored: true, error: 'Telegram reply is not linked to a known asset.' }
        }

        const { data: version, error: versionError } = await supabase
            .from('sistema_asset_versions')
            .select(`
                id,
                version_number,
                asset:sistema_assets(id, nombre, task_id)
            `)
            .eq('id', telegramMessage.asset_version_id)
            .single()

        if (versionError || !version) {
            return { success: false, error: 'Asset version not found for Telegram reply.' }
        }

        const linkedAsset = Array.isArray(version.asset)
            ? version.asset[0]
            : version.asset

        const commentId = await mirrorExternalCommentIntoTask(supabase, {
            taskId: telegramMessage.task_id || linkedAsset?.task_id,
            assetId: telegramMessage.asset_id || linkedAsset?.id,
            assetVersionId: telegramMessage.asset_version_id,
            authorName: params.authorName,
            content: trimmedContent,
            source: 'telegram_feedback',
            isClient: false,
        })

        if (!commentId) {
            return { success: false, error: 'Could not persist Telegram feedback comment.' }
        }

        const uniqueRecipients = await getProjectNotificationRecipients(supabase, telegramMessage.project_id)
        const assetLabel = `${linkedAsset?.nombre || 'Asset'} · v${version.version_number}`
        const taskLink = telegramMessage.task_id ? `/sistema?taskId=${telegramMessage.task_id}` : '/sistema'

        await Promise.all(uniqueRecipients.map((userId) =>
            notifyUser({
                userId,
                type: 'comment',
                title: `Feedback por Telegram: ${assetLabel}`,
                content: `${params.authorName} respondio por Telegram: ${trimmedContent}`,
                link: taskLink,
                data: {
                    projectId: telegramMessage.project_id,
                    assetId: telegramMessage.asset_id,
                    assetVersionId: telegramMessage.asset_version_id,
                    taskId: telegramMessage.task_id,
                    source: 'telegram_feedback',
                    channel: 'telegram',
                }
            })
        ))

        return {
            success: true,
            commentId,
            linkedMessageId: telegramMessage.id,
            taskId: telegramMessage.task_id,
        }
    } catch (error) {
        console.error('Error notifying Telegram reply feedback:', error)
        return { success: false, error: 'Internal server error' }
    }
}

export async function notifyClientAssetStatus(
    token: string,
    assetId: string,
    status: string,
    options?: { mirrorToTask?: boolean }
) {
    try {
        const supabase = createAdminClient()

        const clientAccess = await resolveClientAccessByToken(supabase, token)

        if (!clientAccess) return { success: false, error: 'Invalid token' }

        const { data: asset } = await supabase
            .from('sistema_assets')
            .select('id, nombre, task_id')
            .eq('id', assetId)
            .single()

        if (!asset) return { success: false, error: 'Asset not found' }

        const { data: members } = await supabase
            .from('sistema_project_members')
            .select('user_id')
            .eq('project_id', clientAccess.project_id)

        const recipientIds = members?.map(m => m.user_id) || []

        const statusLabel = status === 'approved_final'
            ? 'Aprobado'
            : status === 'changes_requested'
                ? 'Cambios solicitados'
                : 'Estado actualizado'

        if (options?.mirrorToTask && asset.task_id) {
            await mirrorExternalCommentIntoTask(supabase, {
                taskId: asset.task_id,
                assetId: asset.id,
                authorName: clientAccess.nombre || 'Cliente',
                content: `Marcó el asset "${asset.nombre}" como ${statusLabel.toLowerCase()}.`,
                source: 'asset_status',
            })
        }

        await Promise.all(recipientIds.map(userId =>
            notifyUser({
                userId,
                type: 'status_change',
                title: `Cliente: ${statusLabel}`,
                content: `${clientAccess?.nombre || 'Cliente'} marcó "${asset.nombre}" como ${statusLabel.toLowerCase()}.`,
                link: `/sistema?taskId=${asset.task_id}`,
                data: { projectId: clientAccess.project_id, assetId: asset.id, taskId: asset.task_id, status }
            })
        ))

        return { success: true }
    } catch (error) {
        console.error('Error notifying asset status:', error)
        return { success: false, error: 'Internal server error' }
    }
}

type AssetDeliveryNotificationMode = 'new_asset' | 'new_version' | 'mixed' | 'manual'

interface NotifyClientAssetDeliveryBatchParams {
    projectId: string
    taskId: string
    actorUserId: string
    uploadedAssetIds: string[]
    mode: AssetDeliveryNotificationMode
}

interface NotifyClientAssetDeliveryBatchResult {
    success: boolean
    sent: number
    failed: number
    skipped: number
    pending_assets: number
    telegram_sent: number
    telegram_link_fallbacks: number
    telegram_failed: number
    errors: string[]
}

interface SendTaskAssetsToTelegramParams {
    projectId: string
    taskId: string
    actorUserId: string
    assetIds: string[]
}

interface SendTaskAssetsToTelegramResult {
    success: boolean
    total: number
    sent: number
    link_fallbacks: number
    failed: number
    errors: string[]
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export async function notifyClientAssetDeliveryBatch(
    params: NotifyClientAssetDeliveryBatchParams
): Promise<NotifyClientAssetDeliveryBatchResult> {
    const { projectId, taskId, actorUserId, uploadedAssetIds, mode } = params
    const errors: string[] = []
    let sent = 0
    let failed = 0
    let skipped = 0
    let pendingAssets = 0
    let telegramSent = 0
    let telegramLinkFallbacks = 0
    let telegramFailed = 0

    try {
        const supabase = createAdminClient()
        const uniqueAssetIds = Array.from(new Set((uploadedAssetIds || []).filter(Boolean)))

        if (!projectId || !taskId || !actorUserId || uniqueAssetIds.length === 0) {
            return {
                success: false,
                sent,
                failed,
                skipped,
                pending_assets: pendingAssets,
                telegram_sent: telegramSent,
                telegram_link_fallbacks: telegramLinkFallbacks,
                telegram_failed: telegramFailed,
                errors: ["Missing required payload for delivery notification batch."],
            }
        }

        const [projectResult, taskResult, actorResult, accessesResult, assetsResult, versionsResult] = await Promise.all([
            supabase.from('sistema_projects').select('nombre').eq('id', projectId).single(),
            supabase.from('sistema_tasks').select('titulo').eq('id', taskId).single(),
            supabase.from('sistema_users').select('nombre').eq('id', actorUserId).single(),
            supabase
                .from('sistema_client_access')
                .select('id, nombre, email, delivery_email, notify_asset_delivery, can_view_tasks, expires_at')
                .eq('project_id', projectId)
                .eq('notify_asset_delivery', true)
                .eq('can_view_tasks', true),
            supabase
                .from('sistema_assets')
                .select('id, nombre, asset_type, access_revoked')
                .in('id', uniqueAssetIds),
            supabase
                .from('sistema_asset_versions')
                .select('id, asset_id, version_number, file_url, storage_path, file_size, original_filename, created_at, notified_at')
                .in('asset_id', uniqueAssetIds)
                .order('version_number', { ascending: false })
                .order('created_at', { ascending: false }),
        ])

        const projectName = projectResult.data?.nombre || 'Proyecto'
        const taskTitle = taskResult.data?.titulo || 'Tarea'
        const actorName = actorResult.data?.nombre || 'Equipo Quepia'
        const assets = assetsResult.data || []
        const versions = versionsResult.data || []

        const accesses = accessesResult.data || []
        const latestVersionByAssetId = new Map<string, typeof versions[number]>()

        for (const version of versions) {
            if (!version?.asset_id || latestVersionByAssetId.has(version.asset_id)) continue
            latestVersionByAssetId.set(version.asset_id, version)
        }

        const pendingAssetsForDelivery = assets
            .filter((asset) => !asset.access_revoked)
            .map((asset) => {
                const latestVersion = latestVersionByAssetId.get(asset.id)
                if (!latestVersion) return null
                if (latestVersion.notified_at) return null

                return {
                    assetId: asset.id,
                    assetVersionId: latestVersion.id,
                    assetName: asset.nombre,
                    assetType: asset.asset_type,
                    versionId: latestVersion.id,
                    versionNumber: latestVersion.version_number,
                    fileUrl: latestVersion.file_url,
                    storagePath: latestVersion.storage_path || null,
                    fileSize: latestVersion.file_size || null,
                    originalFilename: latestVersion.original_filename || null,
                }
            })
            .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

        pendingAssets = pendingAssetsForDelivery.length

        if (pendingAssets === 0) {
            return {
                success: true,
                sent,
                failed,
                skipped,
                pending_assets: pendingAssets,
                telegram_sent: telegramSent,
                telegram_link_fallbacks: telegramLinkFallbacks,
                telegram_failed: telegramFailed,
                errors,
            }
        }

        if (accesses.length === 0) {
            return {
                success: true,
                sent,
                failed,
                skipped,
                pending_assets: pendingAssets,
                telegram_sent: telegramSent,
                telegram_link_fallbacks: telegramLinkFallbacks,
                telegram_failed: telegramFailed,
                errors,
            }
        }

        const modeLabel = mode === 'new_version'
            ? 'nueva versión'
            : mode === 'manual'
                ? 'entregables listos para revisar'
                : mode === 'mixed'
                ? 'nuevas entregas'
                : 'nuevos entregables'

        const baseUrl = getClientBaseUrl()

        for (const access of accesses) {
            const isExpired = Boolean(access.expires_at && new Date(access.expires_at) <= new Date())
            if (isExpired) {
                skipped += 1
                continue
            }

            const recipientEmail = (access.delivery_email || access.email || '').trim()
            if (!recipientEmail || !isValidEmail(recipientEmail)) {
                skipped += 1
                errors.push(`Access ${access.id} has invalid delivery email.`)
                continue
            }

            try {
                const directLink = await createClientDirectLink({
                    clientAccessId: access.id,
                    ttlDays: 30,
                    baseUrl,
                })

                const countLabel = `${pendingAssets} entregable${pendingAssets === 1 ? '' : 's'}`
                const contentLines = [
                    `Ya tenés ${countLabel} disponible${pendingAssets === 1 ? '' : 's'} en "${taskTitle}".`,
                    `Proyecto: ${projectName}.`,
                ]

                if (mode === 'manual') {
                    contentLines.push(`Estado: ${modeLabel}.`)
                    contentLines.push(`Notificado por: ${actorName}.`)
                } else {
                    contentLines.push(`Tipo de carga: ${modeLabel}.`)
                    contentLines.push(`Subido por: ${actorName}.`)
                }

                contentLines.push('', 'El acceso directo es válido por 30 días.')

                const content = contentLines.join('\n')

                const result = await sendEmail({
                    type: 'general_notification',
                    to: recipientEmail,
                    data: {
                        recipientName: access.nombre || 'Cliente',
                        title: mode === 'manual' ? 'Entregables listos para revisar' : 'Nuevos entregables disponibles',
                        content,
                        actionUrl: directLink.link,
                        actionText: 'Abrir Entregables',
                    },
                })

                if (!result.success) {
                    failed += 1
                    errors.push(`Failed to send to ${recipientEmail}: ${result.error || 'unknown error'}`)
                    continue
                }

                sent += 1
            } catch (error) {
                failed += 1
                errors.push(`Access ${access.id}: ${error instanceof Error ? error.message : 'unknown error'}`)
            }
        }

        if (sent > 0) {
            const telegramResult = await sendTelegramTextNotice({
                headline: 'Quepia · Cliente notificado',
                lines: [
                    `Proyecto: ${projectName}`,
                    `Tarea: ${taskTitle}`,
                    `Entregables notificados: ${pendingAssets}`,
                    `Avisos por email enviados: ${sent}`,
                    `Notificado por: ${actorName}`,
                    `Modo: ${modeLabel}`,
                ],
            })

            telegramSent += telegramResult.sent
            telegramFailed += telegramResult.failed
            errors.push(...telegramResult.errors)

            const now = new Date().toISOString()
            const versionIdsToMark = pendingAssetsForDelivery.map((asset) => asset.versionId)

            const { error: markError } = await supabase
                .from('sistema_asset_versions')
                .update({ notified_at: now, notified_by: actorUserId })
                .in('id', versionIdsToMark)
                .is('notified_at', null)

            if (markError) {
                errors.push(`No se pudo registrar notified_at para los assets enviados: ${markError.message}`)
                return {
                    success: false,
                    sent,
                    failed,
                    skipped,
                    pending_assets: pendingAssets,
                    telegram_sent: telegramSent,
                    telegram_link_fallbacks: telegramLinkFallbacks,
                    telegram_failed: telegramFailed,
                    errors,
                }
            }
        }

        return {
            success: failed === 0 && telegramFailed === 0,
            sent,
            failed,
            skipped,
            pending_assets: pendingAssets,
            telegram_sent: telegramSent,
            telegram_link_fallbacks: telegramLinkFallbacks,
            telegram_failed: telegramFailed,
            errors,
        }
    } catch (error) {
        return {
            success: false,
            sent,
            failed: failed + 1,
            skipped,
            pending_assets: pendingAssets,
            telegram_sent: telegramSent,
            telegram_link_fallbacks: telegramLinkFallbacks,
            telegram_failed: telegramFailed,
            errors: [
                ...errors,
                error instanceof Error ? error.message : 'Unknown error sending delivery notifications.',
            ],
        }
    }
}

export async function sendTaskAssetsToTelegram(
    params: SendTaskAssetsToTelegramParams
): Promise<SendTaskAssetsToTelegramResult> {
    const { projectId, taskId, actorUserId, assetIds } = params
    const errors: string[] = []
    let sent = 0
    let linkFallbacks = 0
    let failed = 0

    try {
        const supabase = createAdminClient()
        const uniqueAssetIds = Array.from(new Set((assetIds || []).filter(Boolean)))

        if (!projectId || !taskId || !actorUserId || uniqueAssetIds.length === 0) {
            return {
                success: false,
                total: 0,
                sent,
                link_fallbacks: linkFallbacks,
                failed,
                errors: ['Missing required payload for Telegram asset delivery.'],
            }
        }

        const [projectResult, taskResult, actorResult, assetsResult, versionsResult] = await Promise.all([
            supabase.from('sistema_projects').select('nombre').eq('id', projectId).single(),
            supabase.from('sistema_tasks').select('titulo').eq('id', taskId).single(),
            supabase.from('sistema_users').select('nombre').eq('id', actorUserId).single(),
            supabase
                .from('sistema_assets')
                .select('id, nombre, asset_type')
                .in('id', uniqueAssetIds),
            supabase
                .from('sistema_asset_versions')
                .select('id, asset_id, version_number, file_url, storage_path, file_size, original_filename, created_at')
                .in('asset_id', uniqueAssetIds)
                .order('version_number', { ascending: false })
                .order('created_at', { ascending: false }),
        ])

        const projectName = projectResult.data?.nombre || 'Proyecto'
        const taskTitle = taskResult.data?.titulo || 'Tarea'
        const actorName = actorResult.data?.nombre || 'Equipo Quepia'
        const assets = assetsResult.data || []
        const versions = versionsResult.data || []

        const latestVersionByAssetId = new Map<string, typeof versions[number]>()
        for (const version of versions) {
            if (!version?.asset_id || latestVersionByAssetId.has(version.asset_id)) continue
            latestVersionByAssetId.set(version.asset_id, version)
        }

        const telegramAssets = assets
            .map((asset) => {
                const latestVersion = latestVersionByAssetId.get(asset.id)
                if (!latestVersion) {
                    failed += 1
                    errors.push(`Telegram: no se encontró la última versión de "${asset.nombre}".`)
                    return null
                }

                return {
                    assetId: asset.id,
                    assetVersionId: latestVersion.id,
                    assetName: asset.nombre,
                    assetType: asset.asset_type,
                    versionNumber: latestVersion.version_number,
                    fileUrl: latestVersion.file_url,
                    storagePath: latestVersion.storage_path || null,
                    fileSize: latestVersion.file_size || null,
                    originalFilename: latestVersion.original_filename || null,
                }
            })
            .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))

        if (telegramAssets.length === 0) {
            return {
                success: false,
                total: 0,
                sent,
                link_fallbacks: linkFallbacks,
                failed,
                errors: errors.length > 0 ? errors : ['No hay assets con versión disponible para enviar a Telegram.'],
            }
        }

        const telegramResult = await sendTelegramAssetDelivery({
            projectName,
            taskTitle,
            actorName,
            assets: telegramAssets,
            headline: 'Quepia · Assets enviados a Telegram',
            actorLabel: 'Enviado por',
            fallbackLabel: 'Envio por link',
        })

        sent += telegramResult.sent
        linkFallbacks += telegramResult.linkFallbacks
        failed += telegramResult.failed
        errors.push(...telegramResult.errors)

        const persistLinksResult = await persistTelegramMessageLinks(supabase, {
            projectId,
            taskId,
            actorUserId,
            headline: 'Quepia · Assets enviados a Telegram',
            messages: telegramResult.messages,
        })

        if (!persistLinksResult.success) {
            failed += 1
            errors.push(`No se pudo registrar el contexto de reply de Telegram: ${persistLinksResult.error}`)
        }

        return {
            success: failed === 0,
            total: telegramAssets.length,
            sent,
            link_fallbacks: linkFallbacks,
            failed,
            errors,
        }
    } catch (error) {
        return {
            success: false,
            total: Array.from(new Set((assetIds || []).filter(Boolean))).length,
            sent,
            link_fallbacks: linkFallbacks,
            failed: failed + 1,
            errors: [
                ...errors,
                error instanceof Error ? error.message : 'Unknown error sending assets to Telegram.',
            ],
        }
    }
}
