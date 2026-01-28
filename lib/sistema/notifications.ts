import { createAdminClient } from "./supabase/admin"
import { sendEmail } from './email-service'

interface NotificationPayload {
    userId: string
    actorId?: string
    type: 'mention' | 'assignment' | 'approval_request' | 'status_change' | 'comment' | 'system'
    title: string
    content?: string
    link?: string
    data?: Record<string, any>
}

export async function notifyUser(payload: NotificationPayload) {
    // Use Admin Client to bypass RLS (User A needs to insert notification for User B)
    const supabase = createAdminClient()

    try {
        // 1. Check user preferences
        const { data: prefs, error: prefsError } = await supabase
            .from('sistema_notification_preferences')
            .select('*')
            .eq('user_id', payload.userId)
            .single()

        if (prefsError && prefsError.code !== 'PGRST116') {
            console.error('[Notification] Error fetching prefs:', prefsError)
        }

        // Default to true if no prefs found (or if specific pref is null)
        const inAppEnabled = prefs?.in_app_enabled ?? true
        const emailEnabled = prefs?.email_enabled ?? true

        // Logic fix: If prefs is missing, we assume frequency is 'immediate' by default
        const frequency = prefs?.frequency || 'immediate'

        // Check specific type filters
        let shouldNotify = true
        if (prefs) {
            if (payload.type === 'mention' && !prefs.notify_mentions) shouldNotify = false
            if (payload.type === 'assignment' && !prefs.notify_assignments) shouldNotify = false
            if (payload.type === 'approval_request' && !prefs.notify_approvals) shouldNotify = false
            if (payload.type === 'status_change' && !prefs.notify_status_changes) shouldNotify = false
        }

        if (!shouldNotify) return

        // 2. Create In-App Notification
        if (inAppEnabled) {
            const { error: inAppError } = await supabase.from('sistema_notifications').insert({
                user_id: payload.userId,
                actor_id: payload.actorId,
                type: payload.type,
                title: payload.title,
                content: payload.content,
                link: payload.link,
                data: payload.data,
            })
            if (inAppError) console.error('[Notification] Error creating in-app:', inAppError)
        }

        // 3. Send Email (Immediate)
        if (emailEnabled && frequency === 'immediate') {
            try {
                // Get user email
                const { data: userData, error: userError } = await supabase
                    .from('sistema_users')
                    .select('email, nombre')
                    .eq('id', payload.userId)
                    .single()

                if (userError || !userData?.email) {
                    console.error('[Notification] User email not found:', userError)
                    return
                }

                const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://quepia.com'

                await sendEmail({
                    type: payload.type === 'approval_request' ? 'approval_request'
                        : payload.type === 'mention' ? 'mention'
                            : 'general_notification',
                    to: userData.email,
                    data: {
                        ...payload.data,
                        approverName: userData.nombre,
                        recipientName: userData.nombre,
                        title: payload.title,
                        content: payload.content,
                        actionUrl: payload.link ? (payload.link.startsWith('http') ? payload.link : `${baseUrl}${payload.link}`) : `${baseUrl}/sistema`,
                    }
                })
            } catch (emailErr) {
                console.error("[Notification] Error sending email:", emailErr)
            }
        }

    } catch (error) {
        console.error("[Notification] Unexpected error:", error)
    }
}
