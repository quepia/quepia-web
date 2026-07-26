import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

export function McpShell({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090909] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(circle at 20% 0%, rgba(42,231,228,0.13), transparent 35%), radial-gradient(circle at 90% 15%, rgba(136,16,120,0.18), transparent 30%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between gap-4">
          <Link
            href="/sistema"
            className="inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al sistema
          </Link>
          <Link
            href="/sistema/mcp"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/70"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-quepia-cyan" aria-hidden="true" />
            Control MCP
          </Link>
        </nav>

        <header className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-quepia-cyan">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl font-light tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/55 sm:text-base">
            {description}
          </p>
        </header>

        {children}
      </div>
    </main>
  )
}
