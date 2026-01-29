"use client"

import { useState } from "react"
import { sendClientLoginCode } from "@/app/actions/client-auth"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Loader2, ArrowRight, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"

export default function ClientLoginPage() {
    const [email, setEmail] = useState("")
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return

        setLoading(true)
        setError("")

        try {
            const result = await sendClientLoginCode(email)
            if (result.error) {
                setError(result.error)
            } else {
                router.push(`/cliente/verify?email=${encodeURIComponent(email)}`)
            }
        } catch (err) {
            setError("Ocurrió un error inesperado")
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0a0a0a] flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-quepia-cyan/10 to-transparent opacity-30 pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white/[0.02] border border-white/10 rounded-2xl p-8 backdrop-blur-xl relative z-10"
            >
                <div className="text-center mb-8">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center mx-auto mb-6 shadow-xl shadow-quepia-cyan/20">
                        <Image
                            src="/images/logo.png"
                            alt="Quepia"
                            width={40}
                            height={40}
                            className="object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Acceso a Clientes</h1>
                    <p className="text-white/60 text-sm">Ingresa tu email para recibir un código de acceso temporal.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-white/40 uppercase tracking-wider">Email Corporativo</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="nombre@empresa.com"
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan outline-none transition-all"
                            required
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg text-center">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !email}
                        className="w-full bg-quepia-cyan text-black font-semibold py-3.5 rounded-xl hover:bg-quepia-cyan/90 transition-colors flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <>
                                Enviar Código <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center gap-2 text-white/30 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Acceso seguro sin contraseña</span>
                </div>
            </motion.div>
        </div>
    )
}
