"use client"

import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar,
  CheckCircle2,
  Download,
  LayoutGrid,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"
import Image from "next/image"

type ClientTab = "calendar" | "tasks" | "assets"

interface OnboardingOverlayProps {
  clientName: string
  activeTab: ClientTab
  onNavigateTab: (tab: ClientTab) => void
  onComplete: () => void
}

interface TourStep {
  id: string
  title: string
  description: string
  highlights: string[]
  action: string
  tab?: ClientTab
  icon: ReactNode
}

export function ClientOnboardingOverlay({
  clientName,
  activeTab,
  onNavigateTab,
  onComplete,
}: OnboardingOverlayProps) {
  const [step, setStep] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  const steps = useMemo<TourStep[]>(
    () => [
      {
        id: "welcome",
        title: `Hola, ${clientName}`,
        description:
          "Este es tu espacio para seguir entregables, revisar avances y darnos feedback sin salir de Quepia.",
        highlights: [
          "Acceso privado de tu proyecto",
          "Todo centralizado en una sola vista",
          "Diseñado para usar desde el celular",
        ],
        action: "Comenzar guía",
        tab: "calendar",
        icon: (
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-quepia-cyan to-quepia-magenta flex items-center justify-center shadow-lg shadow-quepia-cyan/20">
            <Image src="/images/logo.png" alt="Quepia" width={32} height={32} />
          </div>
        ),
      },
      {
        id: "calendar",
        title: "Calendario de entregas",
        description: "En Calendario ves lo que se publica, reuniones, deadlines y próximos hitos del proyecto.",
        highlights: [
          "Vista mensual clara",
          "Eventos por tipo con colores",
          "Detalle con contexto del proyecto",
        ],
        action: "Ir a Tareas",
        tab: "calendar",
        icon: <Calendar className="w-16 h-16 text-quepia-cyan" />,
      },
      {
        id: "tasks",
        title: "Tareas enfocadas",
        description: "La vista de Tareas prioriza pendientes para que sepas qué está en curso ahora.",
        highlights: [
          "Pendientes visibles por defecto",
          "Completadas opcionales",
          "Detalle por prioridad y fecha",
        ],
        action: "Ir a Recursos",
        tab: "tasks",
        icon: <CheckCircle2 className="w-16 h-16 text-green-400" />,
      },
      {
        id: "resources",
        title: "Recursos y entregables",
        description:
          "En Recursos tenés todos los archivos del proyecto ordenados por más recientes, agrupados por tarea.",
        highlights: [
          "Últimos assets primero",
          "Búsqueda y filtros rápidos",
          "Carruseles, reels y piezas individuales",
        ],
        action: "Cómo revisar",
        tab: "assets",
        icon: <LayoutGrid className="w-16 h-16 text-quepia-cyan" />,
      },
      {
        id: "review",
        title: "Feedback interactivo",
        description:
          "Podés abrir cualquier recurso, comentar puntos exactos y pedir cambios o aprobar para avanzar.",
        highlights: [
          "Comentarios sobre imagen/video",
          "Estados de aprobación simples",
          "Historial claro por versión",
        ],
        action: "Descargas y cierre",
        tab: "assets",
        icon: <MessageSquare className="w-16 h-16 text-quepia-magenta" />,
      },
      {
        id: "downloads",
        title: "Descargas y control",
        description:
          "Podés descargar archivos individuales o paquetes completos cuando lo necesites.",
        highlights: [
          "Descarga por asset o lote",
          "Acceso seguro por sesión",
          "Siempre con la versión más reciente",
        ],
        action: "Finalizar guía",
        tab: "assets",
        icon: <Download className="w-16 h-16 text-white" />,
      },
      {
        id: "done",
        title: "Todo listo",
        description:
          "Ya sabés cómo navegar el sistema. Podés reabrir esta guía cuando quieras desde el botón “Ver guía”.",
        highlights: [
          "Revisar calendario",
          "Seguir tareas pendientes",
          "Aprobar y comentar recursos",
        ],
        action: "Entrar al portal",
        icon: <Sparkles className="w-16 h-16 text-quepia-cyan" />,
      },
    ],
    [clientName]
  )

  useEffect(() => {
    const stepTab = steps[step]?.tab
    if (stepTab && stepTab !== activeTab) {
      onNavigateTab(stepTab)
    }
  }, [activeTab, onNavigateTab, step, steps])

  const closeAndComplete = () => {
    setIsVisible(false)
    setTimeout(onComplete, 220)
  }

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep((prev) => prev + 1)
      return
    }
    closeAndComplete()
  }

  const handleBack = () => {
    if (step > 0) setStep((prev) => prev - 1)
  }

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 1.02 }}
          transition={{ duration: 0.24 }}
          className="w-full max-w-xl bg-[#111111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="h-1 w-full bg-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-quepia-cyan to-quepia-magenta"
              initial={{ width: `${(step / steps.length) * 100}%` }}
              animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="p-6 md:p-8 relative">
            <button
              onClick={closeAndComplete}
              className="absolute top-4 right-4 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Cerrar guía"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 flex items-center justify-between gap-3 pr-8">
              <div className="text-xs uppercase tracking-[0.18em] text-white/35">
                Guía del portal
              </div>
              <div className="text-xs text-white/40">
                {step + 1}/{steps.length}
              </div>
            </div>

            <div className="flex items-start gap-4 mb-5">
              <div className="shrink-0 mt-1">{steps[step].icon}</div>
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold text-white mb-2">{steps[step].title}</h2>
                <p className="text-white/65 leading-relaxed">{steps[step].description}</p>
              </div>
            </div>

            {steps[step].tab && (
              <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-quepia-cyan/20 bg-quepia-cyan/10 text-quepia-cyan text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                Sección activa: {steps[step].tab === "calendar" ? "Calendario" : steps[step].tab === "tasks" ? "Tareas" : "Recursos"}
              </div>
            )}

            <ul className="space-y-2 mb-7">
              {steps[step].highlights.map((item) => (
                <li key={item} className="text-sm text-white/75 flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-quepia-cyan" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleBack}
                disabled={step === 0}
                className="h-10 px-4 rounded-lg border border-white/10 text-sm text-white/70 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Atrás
              </button>

              <button
                onClick={handleNext}
                className="h-10 px-5 rounded-lg s-btn-solid text-sm font-semibold"
              >
                {steps[step].action}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
