"use client"

export default function SistemaError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090909] p-6 text-white">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
        <h1 className="text-lg font-semibold">No pudimos cargar el sistema</h1>
        <p className="mt-2 text-sm text-white/50">Intentá nuevamente. Si continúa, volvé a iniciar sesión.</p>
        <button onClick={reset} className="mt-5 rounded-xl bg-quepia-cyan px-4 py-2 text-sm font-semibold text-black">
          Reintentar
        </button>
      </div>
    </main>
  )
}
