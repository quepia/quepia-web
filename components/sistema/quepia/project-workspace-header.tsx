"use client"

import type { ReactNode } from "react"
import { LayoutGrid, Radar } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

export type ProjectWorkspaceSection = "production" | "intelligence"

interface ProjectWorkspaceHeaderProps {
  projectName: string
  activeSection: ProjectWorkspaceSection
  onSectionChange: (section: ProjectWorkspaceSection) => void
  actions?: ReactNode
}

export function ProjectWorkspaceHeader({
  projectName,
  activeSection,
  onSectionChange,
  actions,
}: ProjectWorkspaceHeaderProps) {
  const tabClass = (section: ProjectWorkspaceSection) => cn(
    "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
    activeSection === section
      ? "bg-white/[0.09] text-white"
      : "text-white/45 hover:bg-white/[0.05] hover:text-white/75",
  )

  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <h1 className="truncate text-lg font-semibold text-white">{projectName}</h1>
        <nav aria-label="Secciones del proyecto" className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-black/20 p-1">
          <button
            type="button"
            onClick={() => onSectionChange("production")}
            className={tabClass("production")}
            aria-current={activeSection === "production" ? "page" : undefined}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Producción
          </button>
          <button
            type="button"
            onClick={() => onSectionChange("intelligence")}
            className={tabClass("intelligence")}
            aria-current={activeSection === "intelligence" ? "page" : undefined}
          >
            <Radar className="h-3.5 w-3.5" />
            Inteligencia
          </button>
        </nav>
      </div>
      {actions ? <div className="flex w-full items-center gap-2 overflow-x-auto sm:w-auto sm:justify-end">{actions}</div> : null}
    </div>
  )
}
