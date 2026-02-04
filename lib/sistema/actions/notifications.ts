'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { notifyUser } from '@/lib/sistema/notifications'

type NotificationType = 'mention' | 'assignment' | 'approval_request' | 'status_change' | 'comment' | 'system'

interface SendNotificationParams {
    userId: string
    actorId?: string
    type: NotificationType
    title: string
    content?: string
    link?: string
    data?: Record<string, any>
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
        const supabase = await createClient()

        // 1. Validate token and get project_id (supports V1 access_token and V2 session UUID)
        let clientAccess: { project_id: string } | null = null

        // Try V1: direct access_token lookup
        const { data: v1Access } = await supabase
            .from('sistema_client_access')
            .select('project_id')
            .eq('access_token', token)
            .single()

        if (v1Access) {
            clientAccess = v1Access
        } else if (token.length === 36) {
            // Try V2: session token -> client_access
            const { data: session } = await supabase
                .from('sistema_client_sessions')
                .select('client_access_id')
                .eq('id', token)
                .single()

            if (session) {
                const { data: v2Access } = await supabase
                    .from('sistema_client_access')
                    .select('project_id')
                    .eq('id', session.client_access_id)
                    .single()

                if (v2Access) clientAccess = v2Access
            }
        }

        if (!clientAccess) return { success: false, error: 'Invalid token' }

        // 2. Get Asset info
        const { data: version } = await supabase
            .from('sistema_asset_versions')
            .select(`
            *,
            asset:sistema_assets(nombre, id)
        `)
            .eq('id', assetVersionId)
            .single()

        if (!version) return { success: false, error: 'Asset not found' }

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
                link: `/sistema?projectId=${clientAccess.project_id}&assetId=${version.asset?.id}`,
                data: { projectId: clientAccess.project_id, assetId: version.asset?.id }
            })
        ))

        return { success: true }
    } catch (error) {
        console.error('Error notifying client feedback:', error)
        return { success: false, error: 'Internal server error' }
    }
}

export async function notifyClientAssetStatus(token: string, assetId: string, status: string) {
    try {
        const supabase = await createClient()

        // Resolve project from token (V1 or V2)
        let clientAccess: { project_id: string; nombre: string } | null = null

        const { data: v1Access } = await supabase
            .from('sistema_client_access')
            .select('project_id, nombre')
            .eq('access_token', token)
            .single()

        if (v1Access) {
            clientAccess = v1Access
        } else if (token.length === 36) {
            const { data: session } = await supabase
                .from('sistema_client_sessions')
                .select('client_access_id')
                .eq('id', token)
                .single()

            if (session?.client_access_id) {
                const { data: v2Access } = await supabase
                    .from('sistema_client_access')
                    .select('project_id, nombre')
                    .eq('id', session.client_access_id)
                    .single()

                if (v2Access) clientAccess = v2Access
            }
        }

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

        await Promise.all(recipientIds.map(userId =>
            notifyUser({
                userId,
                type: 'status_change',
                title: `Cliente: ${statusLabel}`,
                content: `${clientAccess?.nombre || 'Cliente'} marcó "${asset.nombre}" como ${statusLabel.toLowerCase()}.`,
                link: `/sistema?taskId=${asset.task_id}`,
                data: { projectId: clientAccess.project_id, assetId: asset.id, status }
            })
        ))

        return { success: true }
    } catch (error) {
        console.error('Error notifying asset status:', error)
        return { success: false, error: 'Internal server error' }
    }
}
