"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, MessageSquare, ShieldCheck, X } from "lucide-react"
import Image from "next/image"

interface OnboardingOverlayProps {
    clientName: string
    onComplete: () => void
}

export function ClientOnboardingOverlay({ clientName, onComplete }: OnboardingOverlayProps) {
    const [step, setStep] = useState(0)
    const [isVisible, setIsVisible] = useState(true)

    // Pasos del tour
    const steps = [
        {
            title: `¡Hola, ${clientName}!`,
            description: "Bienvenido a tu espacio exclusivo para el seguimiento del proyecto.",
            icon: <div className="w-16 h-16 rounded-full bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center animate-pulse"><Image src="/images/logo.png" alt="Q" width={32} height={32} /></div>,
            action: "Comenzar Tour"
        },
        {
            title: "Tu Espacio Seguro",
            description: "Este portal está protegido y personalizado solo para ti. Aquí verás todos nuestros avances.",
            icon: <ShieldCheck className="w-16 h-16 text-quepia-cyan/80" />,
            action: "Siguiente"
        },
        {
            title: "Revisión Interactiva",
            description: "Haz clic en cualquier imagen o diseño para dejar comentarios puntuales y precisos.",
            icon: <div className="relative"><MessageSquare className="w-16 h-16 text-quepia-magenta/80" /><div className="absolute -top-2 -right-2 bg-quepia-cyan text-black text-xs font-bold px-2 py-1 rounded-full">New</div></div>,
            action: "Entendido"
        },
        {
            title: "Aprobación Simple",
            description: "Marca lo que te gusta y lo que necesitamos ajustar para avanzar rápido.",
            icon: <CheckCircle2 className="w-16 h-16 text-green-400" />,
            action: "Ir a mi Proyecto"
        }
    ]

    const handleNext = () => {
        if (step < steps.length - 1) {
            setStep(step + 1)
        } else {
            setIsVisible(false)
            setTimeout(onComplete, 500) // Wait for exit animation
        }
    }

    if (!isVisible) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
                <motion.div
                    key={step}
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 1.1, opacity: 0, y: -20 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center relative overflow-hidden shadow-2xl"
                >
                    {/* Progress Bar */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-white/5">
                        <motion.div
                            className="h-full bg-gradient-to-r from-quepia-cyan to-quepia-magenta"
                            initial={{ width: `${(step / steps.length) * 100}%` }}
                            animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
                        />
                    </div>

                    <button
                        onClick={() => { setIsVisible(false); onComplete(); }}
                        className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    <div className="mt-8 mb-6 flex justify-center h-24 items-center">
                        {steps[step].icon}
                    </div>

                    <h2 className="text-2xl font-bold text-white mb-3">{steps[step].title}</h2>
                    <p className="text-white/60 mb-8 leading-relaxed">
                        {steps[step].description}
                    </p>

                    <button
                        onClick={handleNext}
                        className="w-full py-3.5 bg-white text-black font-bold rounded-xl hover:bg-quepia-cyan transition-colors"
                    >
                        {steps[step].action}
                    </button>

                    <div className="mt-6 flex justify-center gap-2">
                        {steps.map((_, i) => (
                            <div
                                key={i}
                                className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-white" : "bg-white/20"}`}
                            />
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
