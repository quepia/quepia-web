"use client"

import { useState, useRef, useCallback } from "react"
import { Columns2, Layers, ZoomIn, ZoomOut, X, ChevronDown } from "lucide-react"
import { cn } from "@/lib/sistema/utils"
import type { AssetVersion, Annotation } from "@/types/sistema"
import { FEEDBACK_TYPE_COLORS } from "@/types/sistema"

interface VersionComparisonProps {
  versions: AssetVersion[]
  annotations?: Record<string, Annotation[]>
  isOpen: boolean
  onClose: () => void
  assetName: string
}

export default function VersionComparison({
  versions,
  annotations = {},
  isOpen,
  onClose,
  assetName,
}: VersionComparisonProps) {
  const sorted = [...versions].sort((a, b) => a.version_number - b.version_number)

  const [leftIndex, setLeftIndex] = useState(0)
  const [rightIndex, setRightIndex] = useState(Math.min(1, sorted.length - 1))
  const [zoom, setZoom] = useState(100)
  const [diffMode, setDiffMode] = useState(false)
  const [opacity, setOpacity] = useState(50)
  const [leftDropdown, setLeftDropdown] = useState(false)
  const [rightDropdown, setRightDropdown] = useState(false)

  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)

  const handleScroll = useCallback((source: "left" | "right") => {
    if (syncing.current) return
    syncing.current = true
    const from = source === "left" ? leftPanelRef.current : rightPanelRef.current
    const to = source === "left" ? rightPanelRef.current : leftPanelRef.current
    if (from && to) {
      to.scrollTop = from.scrollTop
      to.scrollLeft = from.scrollLeft
    }
    requestAnimationFrame(() => {
      syncing.current = false
    })
  }, [])

  if (!isOpen || sorted.length === 0) return null

  const leftVersion = sorted[leftIndex]
  const rightVersion = sorted[rightIndex]

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
  }

  const renderAnnotationDots = (versionId: string) => {
    const list = annotations[versionId]
    if (!list || list.length === 0) return null
    return list.map((a) => (
      <div
        key={a.id}
        className="absolute w-3 h-3 rounded-full border-2 border-white shadow-lg pointer-events-none -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${a.x_percent}%`,
          top: `${a.y_percent}%`,
          backgroundColor: FEEDBACK_TYPE_COLORS[a.feedback_type],
        }}
      />
    ))
  }

  const VersionSelector = ({
    selected,
    onSelect,
    open,
    setOpen,
    side,
  }: {
    selected: number
    onSelect: (i: number) => void
    open: boolean
    setOpen: (o: boolean) => void
    side: "left" | "right"
  }) => (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm text-white transition-colors"
      >
        <span>v{sorted[selected].version_number}</span>
        <ChevronDown className="w-3.5 h-3.5 text-white/50" />
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full mt-1 z-10 min-w-[140px] rounded-lg bg-[#1a1a1a] border border-white/10 shadow-xl overflow-hidden",
            side === "right" ? "right-0" : "left-0"
          )}
        >
          {sorted.map((v, i) => (
            <button
              key={v.id}
              onClick={() => {
                onSelect(i)
                setOpen(false)
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors",
                i === selected ? "text-quepia-cyan bg-white/5" : "text-white/70"
              )}
            >
              v{v.version_number}
              <span className="ml-2 text-white/30 text-xs">{formatDate(v.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const renderPanel = (version: AssetVersion, ref: React.RefObject<HTMLDivElement | null>, scrollSource: "left" | "right") => (
    <div
      ref={ref}
      onScroll={() => handleScroll(scrollSource)}
      className="flex-1 overflow-auto relative bg-[#0a0a0a]"
    >
      <div
        className="relative inline-block min-w-full min-h-full"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={version.file_url}
          alt={`v${version.version_number}`}
          className="block max-w-none"
          draggable={false}
        />
        {renderAnnotationDots(version.id)}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0a0a0a]">
        <div className="flex items-center gap-3">
          <h2 className="text-white font-medium text-sm">{assetName}</h2>
          <span className="text-white/30 text-xs">Comparar versiones</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDiffMode(false)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              !diffMode
                ? "bg-quepia-cyan/20 text-quepia-cyan"
                : "text-white/50 hover:text-white/80"
            )}
          >
            <Columns2 className="w-3.5 h-3.5" />
            Lado a lado
          </button>
          <button
            onClick={() => setDiffMode(true)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              diffMode
                ? "bg-quepia-cyan/20 text-quepia-cyan"
                : "text-white/50 hover:text-white/80"
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Modo Diferencias
          </button>

          <div className="w-px h-5 bg-white/10 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Version selectors bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0a0a0a]/80">
        <div className="flex items-center gap-3">
          <VersionSelector
            selected={leftIndex}
            onSelect={setLeftIndex}
            open={leftDropdown}
            setOpen={setLeftDropdown}
            side="left"
          />
          <span className="text-white/20 text-xs">{formatDate(leftVersion.created_at)}</span>
        </div>
        {!diffMode && (
          <div className="flex items-center gap-3">
            <span className="text-white/20 text-xs">{formatDate(rightVersion.created_at)}</span>
            <VersionSelector
              selected={rightIndex}
              onSelect={setRightIndex}
              open={rightDropdown}
              setOpen={setRightDropdown}
              side="right"
            />
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {diffMode ? (
          /* Overlay / diff mode */
          <div
            ref={leftPanelRef}
            className="flex-1 overflow-auto relative bg-[#0a0a0a]"
          >
            <div
              className="relative inline-block min-w-full min-h-full"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: "top left" }}
            >
              {/* Base image (left version) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={leftVersion.file_url}
                alt={`v${leftVersion.version_number}`}
                className="block max-w-none"
                draggable={false}
              />
              {renderAnnotationDots(leftVersion.id)}
              {/* Overlay image (right version) */}
              <div
                className="absolute inset-0"
                style={{ opacity: opacity / 100 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={rightVersion.file_url}
                  alt={`v${rightVersion.version_number}`}
                  className="block max-w-none w-full h-full object-contain"
                  draggable={false}
                />
                {renderAnnotationDots(rightVersion.id)}
              </div>
            </div>
          </div>
        ) : (
          /* Side-by-side mode */
          <>
            {renderPanel(leftVersion, leftPanelRef, "left")}
            <div className="w-px bg-white/10 flex-shrink-0" />
            {renderPanel(rightVersion, rightPanelRef, "right")}
          </>
        )}
      </div>

      {/* Bottom toolbar */}
      <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-white/10 bg-[#0a0a0a]">
        <div className="flex items-center gap-2">
          <ZoomOut className="w-4 h-4 text-white/40" />
          <input
            type="range"
            min={50}
            max={200}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-32 accent-quepia-cyan"
          />
          <ZoomIn className="w-4 h-4 text-white/40" />
          <span className="text-white/50 text-xs w-10 text-center">{zoom}%</span>
        </div>

        {diffMode && (
          <>
            <div className="w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs">v{leftVersion.version_number}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-32 accent-quepia-cyan"
              />
              <span className="text-white/40 text-xs">v{rightVersion.version_number}</span>
              <span className="text-white/50 text-xs w-10 text-center">{opacity}%</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
