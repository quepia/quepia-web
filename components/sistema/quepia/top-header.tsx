"use client"

import { ChevronLeft, ChevronRight, Users, BarChart3, MessageSquare, MoreHorizontal, Search, UserCircle, FileText, Menu } from "lucide-react"

interface TopHeaderProps {
    breadcrumb: string[]
    onOpenClientProfile?: () => void
    onOpenBriefing?: () => void
    onMenuClick?: () => void
}

export function TopHeader({ breadcrumb, onOpenClientProfile, onOpenBriefing, onMenuClick }: TopHeaderProps) {
    return (
        <header className="h-12 border-b border-white/[0.06] bg-[#0a0a0a] flex items-center justify-between px-4">
            {/* Left: Navigation */}
            <div className="flex items-center gap-2">
                {/* Mobile Menu Button */}
                <button
                    onClick={onMenuClick}
                    className="md:hidden p-1.5 hover:bg-white/[0.06] rounded-md transition-colors mr-1"
                >
                    <Menu className="h-4 w-4 text-white/60" />
                </button>

                <button className="hidden md:block p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                    <ChevronLeft className="h-4 w-4 text-white/40" />
                </button>
                <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                    <ChevronRight className="h-4 w-4 text-white/40" />
                </button>

                <div className="flex items-center gap-1 text-sm text-white/40 ml-2">
                    {breadcrumb.map((item, i) => (
                        <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-white/20">/</span>}
                            <span className={i === breadcrumb.length - 1 ? "text-white/80" : "hover:text-white/60 cursor-pointer transition-colors"}>
                                {item}
                            </span>
                        </span>
                    ))}
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1">
                {onOpenBriefing && (
                    <button
                        onClick={onOpenBriefing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors"
                        title="Briefing"
                    >
                        <FileText className="h-4 w-4" />
                        <span>Brief</span>
                    </button>
                )}
                {onOpenClientProfile && (
                    <button
                        onClick={onOpenClientProfile}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors"
                        title="Perfil del cliente"
                    >
                        <UserCircle className="h-4 w-4" />
                        <span>Cliente</span>
                    </button>
                )}
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors">
                    <Search className="h-4 w-4" />
                </button>
                <button className="flex items-center gap-2 px-3 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] rounded-md transition-colors">
                    <Users className="h-4 w-4" />
                    <span>Compartir</span>
                </button>
                <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                    <BarChart3 className="h-4 w-4 text-white/40" />
                </button>
                <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors relative">
                    <MessageSquare className="h-4 w-4 text-white/40" />
                </button>
                <button className="p-1.5 hover:bg-white/[0.06] rounded-md transition-colors">
                    <MoreHorizontal className="h-4 w-4 text-white/40" />
                </button>
            </div>
        </header>
    )
}
