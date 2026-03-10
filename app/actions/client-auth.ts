"use server"

import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { Resend } from "resend"
import { createClientDirectLink, createClientSessionForAccess } from "@/lib/sistema/auth/client-session"
import { getEmailFromAddress } from "@/lib/sistema/email-config"

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Sends a 6-digit login code to the client's email.
 * This is the first step of the Magic Link/OTP flow.
 */
export async function sendClientLoginCode(email: string) {
    const supabase = createAdminClient()

    // 1. Check if email exists in sistema_client_access
    // We normalize email to lowercase
    const normalizedEmail = email.toLowerCase().trim()

    const { data: clients, error } = await supabase
        .from("sistema_client_access")
        .select("id, nombre, project_id")
        .eq("email", normalizedEmail)

    if (error) {
        console.error("Error finding client:", error)
        return { error: "Error interno. Intente nuevamente." }
    }

    if (!clients || clients.length === 0) {
        // Security: Don't reveal if email exists or not, but for UX in this specific app (client portal),
        // we might want to tell them "No encontramos un proyecto asociado a este email".
        // Let's return a generic success to prevent enumeration, OR specific if we trust the user base needed specific feedback.
        // User requested "friendly", so let's be honest but safe? 
        // "Si el email existe, recibirás un código."
        return { success: true }
    }

    // 2. Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 mins

    // 3. Update all client records for this email with the OTP
    // (If they have multiple projects, the same OTP works for all entitlement)
    const { error: updateError } = await supabase
        .from("sistema_client_access")
        .update({
            otp_code: otp,
            otp_expires_at: expiresAt.toISOString()
        })
        .eq("email", normalizedEmail)

    if (updateError) {
        console.error("Error updating OTP:", updateError)
        return { error: "Error al generar código." }
    }

    // 4. Send Email
    // We take the first client name found for personalization
    const clientName = clients[0].nombre

    try {
        await resend.emails.send({
            from: getEmailFromAddress(),
            to: normalizedEmail,
            subject: "Tu código de acceso a Quepia",
            html: `
                <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
                    <h2>Hola ${clientName},</h2>
                    <p>Tu código de acceso temporal es:</p>
                    <h1 style="font-size: 32px; letter-spacing: 5px; background: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px;">${otp}</h1>
                    <p>Este código expira en 15 minutos.</p>
                    <p>Si no solicitaste este acceso, puedes ignorar este email.</p>
                </div>
            `
        })
    } catch (emailError) {
        console.error("Error sending email:", emailError)
        // Check if using default test key -> only works for designated email
        return { error: "No se pudo enviar el email. Contacta a soporte." }
    }

    return { success: true, email: normalizedEmail }
}

/**
 * Verifies the 6-digit code.
 * If valid, creates a session and returns the session token.
 */
export async function verifyClientLoginCode(email: string, code: string) {
    const supabase = createAdminClient()
    const normalizedEmail = email.toLowerCase().trim()

    // 1. Verify Code matches and not expired
    const { data: clients, error } = await supabase
        .from("sistema_client_access")
        .select("id, project_id, otp_code, otp_expires_at")
        .eq("email", normalizedEmail)

    if (error || !clients || clients.length === 0) {
        return { error: "Email no encontrado o código inválido." }
    }

    // Check strict match on at least one record (they should all be updated)
    // We check the first one
    const client = clients[0]

    if (client.otp_code !== code) {
        return { error: "Código incorrecto." }
    }

    if (new Date(client.otp_expires_at) < new Date()) {
        return { error: "El código ha expirado." }
    }

    // 2. Create Session
    // For now, we create a session for the FIRST project found.
    // Ideally we'd ask them to select, but let's streamline.
    // Or we create a session that effectively logs them into... specific ClientAccessID.
    const targetAccessId = client.id
    // ^ Limitation: Only logs into first project. 
    // Fix: If multiple projects, we ideally want to return them all and let UI pick, but
    // `sistema_client_sessions` links to `client_access_id` (single).
    // Let's stick to this for V1.

    let sessionId: string
    try {
        const session = await createClientSessionForAccess({ clientAccessId: targetAccessId, ttlDays: 30 })
        sessionId = session.sessionId
    } catch (sessionError) {
        console.error("Error creating session:", sessionError)
        return { error: "Error al iniciar sesión." }
    }

    // Clear OTP for security
    await supabase
        .from("sistema_client_access")
        .update({ otp_code: null, otp_expires_at: null })
        .eq("email", normalizedEmail)

    return { success: true, token: sessionId }
}

/**
 * Generates a direct access session link for a client.
 * Used by admins when email delivery fails — allows sharing
 * the link via WhatsApp or any other channel.
 */
export async function generateDirectAccessLink(clientAccessId: string) {
    const supabase = createAdminClient()

    // Verify the client access record exists
    const { data: client, error } = await supabase
        .from("sistema_client_access")
        .select("id, nombre, email")
        .eq("id", clientAccessId)
        .single()

    if (error || !client) {
        return { error: "Acceso de cliente no encontrado." }
    }

    try {
        const session = await createClientDirectLink({ clientAccessId, ttlDays: 30 })
        return { success: true, token: session.sessionId, link: session.link, clientName: client.nombre }
    } catch (sessionError) {
        console.error("Error creating direct session:", sessionError)
        return { error: "Error al generar la sesión." }
    }
}
