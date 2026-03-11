'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { notifyUser } from '@/lib/sistema/notifications'
import { sendEmail } from '@/lib/sistema/email-service'
import { createClientDirectLink, getClientBaseUrl } from '@/lib/sistema/auth/client-session'

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
    source: 'asset_feedback' | 'asset_status'
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

async function mirrorExternalCommentIntoTask(supabase: ReturnType<typeof createAdminClient>, params: ExternalTaskCommentParams) {
    if (!params.taskId) return

    const { error } = await supabase
        .from('sistema_comments')
        .insert({
            task_id: params.taskId,
            user_id: null,
            author_name: params.authorName,
            is_client: true,
            source: params.source,
            asset_id: params.assetId || null,
            asset_version_id: params.assetVersionId || null,
            contenido: params.content,
        })

    if (error) {
        console.error('Error mirroring external comment into task:', error)
    }
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

        // 3. Get Project Members
        const { data: members } = await supabase
            .from('sistema_project_members')
            .select('user_id')
            .eq('project_id', clientAccess.project_id)

        const recipientIds = members?.map(m => m.user_id) || []

        // Also notify any admin
        const { data: admins } = await supabase
            .from('sistema_users')
            .select('id')
            .eq('role', 'admin') // Assuming role column

        const adminIds = admins?.map(a => a.id) || []
        const uniqueRecipients = Array.from(new Set([...recipientIds, ...adminIds]))

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

type AssetDeliveryNotificationMode = 'new_asset' | 'new_version' | 'mixed'

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

    try {
        const supabase = createAdminClient()
        const uniqueAssetIds = Array.from(new Set((uploadedAssetIds || []).filter(Boolean)))

        if (!projectId || !taskId || !actorUserId || uniqueAssetIds.length === 0) {
            return {
                success: false,
                sent,
                failed,
                skipped,
                errors: ["Missing required payload for delivery notification batch."],
            }
        }

        const [projectResult, taskResult, actorResult, accessesResult] = await Promise.all([
            supabase.from('sistema_projects').select('nombre').eq('id', projectId).single(),
            supabase.from('sistema_tasks').select('titulo').eq('id', taskId).single(),
            supabase.from('sistema_users').select('nombre').eq('id', actorUserId).single(),
            supabase
                .from('sistema_client_access')
                .select('id, nombre, email, delivery_email, notify_asset_delivery, can_view_tasks, expires_at')
                .eq('project_id', projectId)
                .eq('notify_asset_delivery', true)
                .eq('can_view_tasks', true),
        ])

        const projectName = projectResult.data?.nombre || 'Proyecto'
        const taskTitle = taskResult.data?.titulo || 'Tarea'
        const actorName = actorResult.data?.nombre || 'Equipo Quepia'

        const accesses = accessesResult.data || []
        if (accesses.length === 0) {
            return { success: true, sent, failed, skipped, errors }
        }

        const modeLabel = mode === 'new_version'
            ? 'nueva versión'
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

                const countLabel = `${uniqueAssetIds.length} entregable${uniqueAssetIds.length === 1 ? '' : 's'}`
                const content = [
                    `Ya tenés ${countLabel} disponible${uniqueAssetIds.length === 1 ? '' : 's'} en "${taskTitle}".`,
                    `Proyecto: ${projectName}.`,
                    `Tipo de carga: ${modeLabel}.`,
                    `Subido por: ${actorName}.`,
                    '',
                    'El acceso directo es válido por 30 días.',
                ].join('\n')

                const result = await sendEmail({
                    type: 'general_notification',
                    to: recipientEmail,
                    data: {
                        recipientName: access.nombre || 'Cliente',
                        title: 'Nuevos entregables disponibles',
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

        return {
            success: failed === 0,
            sent,
            failed,
            skipped,
            errors,
        }
    } catch (error) {
        return {
            success: false,
            sent,
            failed: failed + 1,
            skipped,
            errors: [
                ...errors,
                error instanceof Error ? error.message : 'Unknown error sending delivery notifications.',
            ],
        }
    }
}
