"use server"

import { createClient } from "@/lib/sistema/supabase/server"
import { revalidatePath } from "next/cache"

export async function getPreferences(userId: string) {
    const supabase = await createClient()

    try {
        const { data, error } = await supabase
            .from('sistema_notification_preferences')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error("Error fetching preferences:", error)
            return { success: false, error: error.message }
        }

        // If no preferences found, return defaults (or we could auto-create here)
        if (!data) {
            return {
                success: true,
                data: {
                    email_enabled: true,
                    in_app_enabled: true,
                    frequency: "immediate",
                    notify_mentions: true,
                    notify_assignments: true,
                    notify_approvals: true,
                }
            }
        }

        return { success: true, data }
    } catch (error) {
        console.error("Unexpected error:", error)
        return { success: false, error: "Failed to fetch preferences" }
    }
}

export async function updatePreferences(userId: string, preferences: any) {
    const supabase = await createClient()

    try {
        // Upsert preferences
        const { error } = await supabase
            .from('sistema_notification_preferences')
            .upsert({
                user_id: userId,
                ...preferences,
                updated_at: new Date().toISOString()
            })

        if (error) throw error

        revalidatePath('/sistema')
        return { success: true }
    } catch (error) {
        console.error("Error updating preferences:", error)
        return { success: false, error: "Failed to update preferences" }
    }
}
