"use client"

import { useState, useEffect } from "react"
import { Bell, Mail, Clock, Check } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import { updatePreferences, getPreferences } from "@/lib/sistema/actions/preferences"

interface NotificationSettingsProps {
    userId: string
    onClose?: () => void
}

export function NotificationSettings({ userId, onClose }: NotificationSettingsProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [preferences, setPreferences] = useState({
        email_enabled: true,
        in_app_enabled: true,
        frequency: "immediate", // immediate, daily_digest, weekly
        notify_mentions: true,
        notify_assignments: true,
        notify_approvals: true,
        notify_status_changes: true // Added to match schema
    })

    useEffect(() => {
        let mounted = true
        
        async function loadPreferences() {
            try {
                const result = await getPreferences(userId)
                if (mounted && result.success && result.data) {
                    setPreferences(prev => ({
                        ...prev,
                        ...result.data
                    }))
                }
            } catch (error) {
                console.error("Failed to load preferences", error)
            } finally {
                if (mounted) setLoading(false)
            }
        }

        loadPreferences()

        return () => { mounted = false }
    }, [userId])

    const handleToggle = (key: keyof typeof preferences) => {
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }))
    }

    const handleChange = (key: keyof typeof preferences, value: any) => {
        setPreferences(prev => ({ ...prev, [key]: value }))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const result = await updatePreferences(userId, preferences)
            if (result.success) {
                if (onClose) onClose()
            } else {
                console.error("Failed to save preferences:", result.error)
                // Optionally add error UI state here
            }
        } catch (error) {
            console.error("Error saving preferences:", error)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 max-w-md w-full mx-auto min-h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-quepia-cyan"></div>
            </div>
        )
    }

    return (
        <div className="bg-[#1a1a1a] border border-white/10 rounded-xl p-6 max-w-md w-full mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bell className="h-5 w-5 text-quepia-cyan" />
                    Notificaciones
                </h2>
            </div>

            <div className="space-y-6">
                {/* Channels */}
                <div className="space-y-3">
                    <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Canales</h3>
                    <div className="bg-white/[0.03] rounded-lg p-1">
                        <label className="flex items-center justify-between p-3 rounded-md hover:bg-white/[0.04] cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                                <Mail className={cn("h-5 w-5", preferences.email_enabled ? "text-white" : "text-white/30")} />
                                <div>
                                    <p className="text-sm font-medium text-white">Email</p>
                                    <p className="text-xs text-white/40">Recibe actualizaciones en tu correo</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={preferences.email_enabled}
                                onChange={() => handleToggle("email_enabled")}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-quepia-cyan focus:ring-quepia-cyan/50"
                            />
                        </label>
                        <label className="flex items-center justify-between p-3 rounded-md hover:bg-white/[0.04] cursor-pointer transition-colors">
                            <div className="flex items-center gap-3">
                                <Bell className={cn("h-5 w-5", preferences.in_app_enabled ? "text-white" : "text-white/30")} />
                                <div>
                                    <p className="text-sm font-medium text-white">In-App</p>
                                    <p className="text-xs text-white/40">Badges y alertas dentro del sistema</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={preferences.in_app_enabled}
                                onChange={() => handleToggle("in_app_enabled")}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-quepia-cyan focus:ring-quepia-cyan/50"
                            />
                        </label>
                    </div>
                </div>

                {/* Frequency */}
                {preferences.email_enabled && (
                    <div className="space-y-3">
                        <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Frecuencia por Email</h3>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => handleChange("frequency", "immediate")}
                                className={cn(
                                    "p-3 rounded-lg border text-left transition-all",
                                    preferences.frequency === "immediate"
                                        ? "bg-quepia-cyan/10 border-quepia-cyan text-white"
                                        : "bg-white/[0.03] border-white/10 text-white/60 hover:border-white/20"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium">Inmediata</span>
                                    {preferences.frequency === "immediate" && <Check className="h-3 w-3 text-quepia-cyan" />}
                                </div>
                                <p className="text-[10px] opacity-60">Al momento que ocurren</p>
                            </button>
                            <button
                                onClick={() => handleChange("frequency", "daily_digest")}
                                className={cn(
                                    "p-3 rounded-lg border text-left transition-all",
                                    preferences.frequency === "daily_digest"
                                        ? "bg-quepia-cyan/10 border-quepia-cyan text-white"
                                        : "bg-white/[0.03] border-white/10 text-white/60 hover:border-white/20"
                                )}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm font-medium">Resumen Diario</span>
                                    {preferences.frequency === "daily_digest" && <Check className="h-3 w-3 text-quepia-cyan" />}
                                </div>
                                <p className="text-[10px] opacity-60">Un solo email a las 9 AM</p>
                            </button>
                        </div>
                    </div>
                )}

                {/* Triggers */}
                <div className="space-y-3">
                    <h3 className="text-xs font-medium text-white/40 uppercase tracking-wider">Notificarme cuando...</h3>
                    <div className="space-y-1">
                        {[
                            { k: "notify_mentions", l: "Alguien me menciona" },
                            { k: "notify_assignments", l: "Me asignan una tarea" },
                            { k: "notify_approvals", l: "Solicitan mi aprobación" },
                        ].map(item => (
                            <label key={item.k} className="flex items-center justify-between px-3 py-2 rounded hover:bg-white/[0.04] cursor-pointer group">
                                <span className="text-sm text-white/80 group-hover:text-white transition-colors">{item.l}</span>
                                <input
                                    type="checkbox"
                                    checked={(preferences as any)[item.k]}
                                    onChange={() => handleToggle(item.k as any)}
                                    className="w-4 h-4 rounded border-white/20 bg-white/5 text-quepia-cyan focus:ring-quepia-cyan/50"
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                        >
                            Cancelar
                        </button>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2 bg-gradient-to-r from-quepia-cyan to-quepia-magenta text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving ? "Guardando..." : "Guardar Preferencias"}
                    </button>
                </div>
            </div>
        </div>
    )
}
