"use client"

import { useState, useRef, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { verifyClientLoginCode } from "@/app/actions/client-auth"
import { Loader2, AlertCircle, ArrowRight } from "lucide-react"

function VerifyContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const email = searchParams?.get("email") || ""

    const [otp, setOtp] = useState(["", "", "", "", "", ""])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const inputRefs = useRef<(HTMLInputElement | null)[]>([])

    // Focus first input on mount
    useEffect(() => {
        if (inputRefs.current[0]) {
            inputRefs.current[0].focus()
        }
    }, [])

    const handleChange = (index: number, value: string) => {
        if (isNaN(Number(value))) return

        const newOtp = [...otp]
        newOtp[index] = value
        setOtp(newOtp)

        // Move to next input
        if (value && index < 5 && inputRefs.current[index + 1]) {
            inputRefs.current[index + 1]?.focus()
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !otp[index] && index > 0 && inputRefs.current[index - 1]) {
            inputRefs.current[index - 1]?.focus()
        }
    }

    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault()
        const pastedData = e.clipboardData.getData("text").slice(0, 6)
        if (!/^\d+$/.test(pastedData)) return

        const newOtp = [...otp]
        pastedData.split("").forEach((char, index) => {
            if (index < 6) newOtp[index] = char
        })
        setOtp(newOtp)

        // Focus last filled input or the next empty one
        const lastIndex = Math.min(pastedData.length, 5)
        if (inputRefs.current[lastIndex]) {
            inputRefs.current[lastIndex]?.focus()
        }
    }

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        const code = otp.join("")
        if (code.length !== 6) return

        setLoading(true)
        setError("")

        try {
            const result = await verifyClientLoginCode(email, code)

            if (result.error) {
                setError(result.error)
                setLoading(false)
            } else if (result.token) {
                // Success - Redirect to dashboard with session token
                router.push(`/cliente/${result.token}`)
            }
        } catch (err) {
            setError("Error de verificación")
            setLoading(false)
        }
    }

    // Auto-submit when 6 digits are filled
    useEffect(() => {
        if (otp.join("").length === 6) {
            handleSubmit()
        }
    }, [otp])

    return (
        <div className="w-full max-w-md bg-[#111111] border border-white/10 rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center mx-auto mb-4 shadow-lg shadow-quepia-cyan/20">
                    <Image
                        src="/images/logo.png"
                        alt="Quepia"
                        width={32}
                        height={32}
                        className="object-contain"
                    />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Verifica tu identidad</h1>
                <p className="text-white/60 text-sm">
                    Ingresa el código de 6 dígitos enviado a <br />
                    <span className="text-quepia-cyan">{email}</span>
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex justify-between gap-2">
                    {otp.map((digit, index) => (
                        <input
                            key={index}
                            ref={(el) => { inputRefs.current[index] = el }}
                            type="text"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            onPaste={handlePaste}
                            className="w-12 h-14 bg-white/5 border border-white/10 rounded-lg text-center text-xl font-bold text-white focus:border-quepia-cyan focus:ring-1 focus:ring-quepia-cyan outline-none transition-all"
                            disabled={loading}
                        />
                    ))}
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-in slide-in-from-top-2">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || otp.join("").length !== 6}
                    className="w-full h-11 bg-quepia-cyan hover:bg-quepia-cyan/90 text-black font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <>
                            Verificar Acceso
                            <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </button>

                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => router.push("/cliente/login")}
                        className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                        ¿Email incorrecto? Volver atrás
                    </button>
                </div>
            </form>
        </div>
    )
}

export default function VerifyPage() {
    return (
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            <div className="relative z-10 w-full flex justify-center">
                <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin text-quepia-cyan" />}>
                    <VerifyContent />
                </Suspense>
            </div>
        </div>
    )
}
