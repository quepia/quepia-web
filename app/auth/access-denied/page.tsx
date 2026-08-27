"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Loader2, LogOut, ShieldAlert } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function AccessDeniedPage() {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)

    try {
      const supabase = createClient()
      await supabase.auth.signOut({ scope: "local" })
    } finally {
      router.replace("/auth/login")
      router.refresh()
      setIsSigningOut(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080808] px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(42,231,228,0.18),transparent_38%),radial-gradient(circle_at_85%_80%,rgba(136,16,120,0.35),transparent_42%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(42,231,228,0.08),transparent_45%,rgba(220,43,162,0.12))]" />

      <section className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#111]/90 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-400/20 bg-red-400/10">
          <ShieldAlert className="h-8 w-8 text-red-400" aria-hidden="true" />
        </div>

        <div className="text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Acceso restringido
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/60 sm:text-base">
            Tu cuenta de Google fue autenticada, pero no está autorizada para
            acceder al sistema de Kepia.
          </p>
        </div>

        <div className="my-7 rounded-xl border border-amber-300/25 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-100/80">
          Kepia utiliza una lista de usuarios autorizados. Si necesitás acceso,
          contactá a un administrador para que habilite tu cuenta desde Gestión
          de Usuarios.
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-wait disabled:opacity-70"
        >
          {isSigningOut ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <LogOut className="h-4 w-4" aria-hidden="true" />
          )}
          Cerrar sesión
        </button>

        <Link
          href="/"
          className="mt-5 block text-center text-sm text-white/50 transition hover:text-white"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  )
}
