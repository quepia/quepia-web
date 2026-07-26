import type { LucideIcon } from "lucide-react"

const TONES = {
  neutral: "border-white/10 bg-white/[0.035] text-white",
  success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-100",
  warning: "border-amber-500/25 bg-amber-500/[0.08] text-amber-100",
  danger: "border-red-500/25 bg-red-500/[0.08] text-red-100",
  info: "border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-100",
} as const

export function StatusCard({
  icon: Icon,
  title,
  children,
  tone = "neutral",
}: {
  icon: LucideIcon
  title: string
  children: React.ReactNode
  tone?: keyof typeof TONES
}) {
  return (
    <section className={`rounded-2xl border p-5 ${TONES[tone]}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl border border-current/10 bg-black/15 p-2">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <div className="mt-1 text-sm leading-6 text-current/70">{children}</div>
        </div>
      </div>
    </section>
  )
}
