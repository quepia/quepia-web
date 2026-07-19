"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  History,
  ImageIcon,
  Loader2,
  Palette,
  Paperclip,
  Upload,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  X,
} from "lucide-react"
import type {
  CreativeDirectionsResult,
  CreativeInlineReference,
  CreativePieceContext,
  CreativePromptPack,
  CreativePromptVersion,
  CreativeReview,
  CreativeStudioContextResponse,
  CreativeStudioDraft,
} from "@/lib/ai/creative-studio-types"
import { EMPTY_CREATIVE_PIECE_CONTEXT } from "@/lib/ai/creative-studio-types"
import { readCreativeStudioDraft, saveCreativeStudioDraft } from "@/lib/sistema/creative-studio-draft"
import { cn } from "@/lib/sistema/utils"

interface CreativeAIStudioModalProps {
  taskId: string
  isOpen: boolean
  onClose: () => void
  initialAssetId?: string | null
}

type StudioStep = "context" | "directions" | "prompt" | "review"
type BusyAction = "directions" | "prompt" | "review" | "save" | null

const STEPS: Array<{ id: StudioStep; label: string; icon: typeof Target }> = [
  { id: "context", label: "Contexto", icon: Target },
  { id: "directions", label: "Direcciones", icon: Palette },
  { id: "prompt", label: "Prompt Pack", icon: FileText },
  { id: "review", label: "Revisión", icon: Eye },
]

const MODEL_OPTIONS = [
  ["general", "General"],
  ["chatgpt", "ChatGPT Image"],
  ["midjourney", "Midjourney"],
  ["imagen", "Imagen"],
  ["firefly", "Adobe Firefly"],
] as const

const PRODUCTION_OPTIONS = [
  ["photo-with-overlay", "Imagen base + titular en diseño"],
  ["visual-only", "Solo imagen, sin texto"],
] as const

const MAX_INLINE_REFERENCES = 4
const MAX_REFERENCE_FILE_SIZE = 12 * 1024 * 1024

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la referencia"))
    reader.onload = () => resolve(String(reader.result || ""))
    reader.readAsDataURL(file)
  })
}

async function prepareInlineReference(file: File): Promise<CreativeInlineReference> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name}: formato no compatible`)
  if (file.size > MAX_REFERENCE_FILE_SIZE) throw new Error(`${file.name}: supera 12 MB`)

  const source = await fileToDataUrl(file)
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new window.Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error(`${file.name}: no se pudo procesar`))
    element.src = source
  })
  const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext("2d")
  if (!context) throw new Error(`${file.name}: no se pudo preparar`)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.7))
  if (!compressed || compressed.size > 850_000) throw new Error(`${file.name}: no se pudo reducir lo suficiente`)

  return {
    id: crypto.randomUUID(),
    name: file.name || "referencia-pegada.webp",
    mediaType: "image/webp",
    dataUrl: await fileToDataUrl(compressed),
  }
}

function normalizePromptPack(pack: CreativePromptPack): CreativePromptPack {
  return {
    ...pack,
    captionBoundary: pack.captionBoundary || "",
    variations: Array.isArray(pack.variations) ? pack.variations : [],
    publishabilityChecklist: Array.isArray(pack.publishabilityChecklist) ? pack.publishabilityChecklist : [],
  }
}

function normalizeReview(review: CreativeReview | null): CreativeReview | null {
  if (!review) return null
  const legacyScores = review.scores as CreativeReview["scores"] & Record<string, number>
  return {
    ...review,
    verdict: review.verdict || "needs-work",
    scores: {
      brandConsistency: legacyScores.brandConsistency || 1,
      taskAlignment: legacyScores.taskAlignment || legacyScores.messageClarity || 1,
      socialPublishability: legacyScores.socialPublishability || legacyScores.technicalCompliance || 1,
      mobileLegibility: legacyScores.mobileLegibility || legacyScores.composition || 1,
      visualAuthenticity: legacyScores.visualAuthenticity || 1,
    },
    layoutCorrection: review.layoutCorrection || "",
  }
}

function buildInitialPieceContext(context: CreativeStudioContextResponse): CreativePieceContext {
  const task = context.task
  const brief = context.brief
  return {
    ...EMPTY_CREATIVE_PIECE_CONTEXT,
    deliverableType: task.taskType || "Diseño visual",
    platform: brief?.platforms?.[0] || "",
    format: brief?.output_formats?.[0] || "",
    objective: task.title,
  }
}

function formatPromptPack(pack: CreativePromptPack) {
  return [
    pack.title,
    pack.rationale ? `RATIONALE\n${pack.rationale}` : "",
    `VISUAL PROMPT\n${pack.visualPrompt}`,
    pack.brandRules ? `BRAND RULES\n${pack.brandRules}` : "",
    pack.negativePrompt ? `NEGATIVE PROMPT\n${pack.negativePrompt}` : "",
    pack.layoutNotes ? `LAYOUT NOTES\n${pack.layoutNotes}` : "",
    pack.exactCopy ? `DESIGN HEADLINE — DO NOT SEND TO IMAGE GENERATOR\n${pack.exactCopy}` : "",
    pack.captionBoundary ? `CAPTION BOUNDARY\n${pack.captionBoundary}` : "",
    pack.technicalSettings ? `TECHNICAL SETTINGS\n${pack.technicalSettings}` : "",
    pack.variations.length ? `VARIATIONS\n${pack.variations.map((variation, index) => `${index + 1}. ${variation}`).join("\n")}` : "",
    pack.publishabilityChecklist.length ? `PUBLISHABILITY CHECKLIST\n${pack.publishabilityChecklist.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n")
}

export function CreativeAIStudioModal({ taskId, isOpen, onClose, initialAssetId }: CreativeAIStudioModalProps) {
  const [context, setContext] = useState<CreativeStudioContextResponse | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)
  const [activeStep, setActiveStep] = useState<StudioStep>("context")
  const [pieceContext, setPieceContext] = useState<CreativePieceContext>(EMPTY_CREATIVE_PIECE_CONTEXT)
  const [directionsResult, setDirectionsResult] = useState<CreativeDirectionsResult | null>(null)
  const [selectedDirectionId, setSelectedDirectionId] = useState("")
  const [promptPack, setPromptPack] = useState<CreativePromptPack | null>(null)
  const [review, setReview] = useState<CreativeReview | null>(null)
  const [inlineReferences, setInlineReferences] = useState<CreativeInlineReference[]>([])
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([])
  const [reviewAssetIds, setReviewAssetIds] = useState<string[]>([])
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [referenceBusy, setReferenceBusy] = useState(false)
  const [draftReady, setDraftReady] = useState(false)
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState("")
  const [copiedField, setCopiedField] = useState("")
  const [assetsUsed, setAssetsUsed] = useState(0)
  const [assetsFailed, setAssetsFailed] = useState(0)
  const copyTimerRef = useRef<number | null>(null)
  const latestDraftRef = useRef<CreativeStudioDraft | null>(null)

  const selectedDirection = directionsResult?.directions.find((direction) => direction.id === selectedDirectionId) || null

  const buildDraft = useCallback((): CreativeStudioDraft => ({
    taskId,
    pieceContext,
    directionsResult,
    selectedDirectionId,
    promptPack,
    review,
    referenceAssetIds,
    reviewAssetIds,
    inlineReferences,
    activeStep,
    updatedAt: new Date().toISOString(),
  }), [activeStep, directionsResult, inlineReferences, pieceContext, promptPack, referenceAssetIds, review, reviewAssetIds, selectedDirectionId, taskId])

  const persistDraft = useCallback(async () => {
    if (!draftReady || !taskId) return
    setDraftStatus("saving")
    try {
      await saveCreativeStudioDraft(buildDraft())
      setDraftStatus("saved")
    } catch (draftError) {
      console.error("[CreativeStudioDraft] Error:", draftError)
      setDraftStatus("error")
    }
  }, [buildDraft, draftReady, taskId])

  useEffect(() => {
    latestDraftRef.current = draftReady ? buildDraft() : null
  }, [buildDraft, draftReady])

  useEffect(() => () => {
    const latest = latestDraftRef.current
    if (latest) void saveCreativeStudioDraft(latest)
  }, [])

  const closeStudio = useCallback(() => {
    void persistDraft()
    onClose()
  }, [onClose, persistDraft])

  const loadContext = useCallback(async (signal?: AbortSignal) => {
    if (!taskId) return
    setLoadingContext(true)
    setDraftReady(false)
    setDraftStatus("idle")
    setError("")
    try {
      const response = await fetch(`/api/ai/creative-studio/context?taskId=${encodeURIComponent(taskId)}`, { signal })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo cargar el Estudio Creativo")
      const next = data as CreativeStudioContextResponse
      let draft: CreativeStudioDraft | null = null
      try {
        draft = await readCreativeStudioDraft(taskId)
      } catch (draftError) {
        console.error("[CreativeStudioDraft] Read error:", draftError)
        setDraftStatus("error")
      }
      if (signal?.aborted) return
      setContext(next)
      const assetId = initialAssetId && next.assets.some((asset) => asset.id === initialAssetId) ? initialAssetId : null
      const validAssetIds = new Set(next.assets.map((asset) => asset.id))
      const savedPiece = draft?.pieceContext as (CreativePieceContext & { exactText?: string }) | undefined
      setPieceContext({
        ...buildInitialPieceContext(next),
        ...(savedPiece || {}),
        headlineText: savedPiece?.headlineText || savedPiece?.exactText || "",
        productionMode: savedPiece?.productionMode || "photo-with-overlay",
      })
      setReviewAssetIds(assetId ? [assetId] : (draft?.reviewAssetIds || []).filter((id) => validAssetIds.has(id)))
      setReferenceAssetIds((draft?.referenceAssetIds || []).filter((id) => validAssetIds.has(id)))
      setInlineReferences((draft?.inlineReferences || [])
        .filter((item) => item.dataUrl?.startsWith("data:image/"))
        .slice(0, MAX_INLINE_REFERENCES))
      setDirectionsResult(draft?.directionsResult || null)
      setSelectedDirectionId(draft?.selectedDirectionId || "")
      setPromptPack(draft?.promptPack ? normalizePromptPack(draft.promptPack) : null)
      setReview(normalizeReview(draft?.review || null))
      setActiveStep(assetId ? "review" : draft?.activeStep || "context")
      setDraftReady(true)
      if (draft) setDraftStatus("saved")
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el Estudio Creativo")
    } finally {
      if (!signal?.aborted) setLoadingContext(false)
    }
  }, [initialAssetId, taskId])

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    void loadContext(controller.signal)
    return () => controller.abort()
  }, [isOpen, loadContext])

  useEffect(() => {
    if (!isOpen || !draftReady) return
    const timer = window.setTimeout(() => void persistDraft(), 450)
    return () => window.clearTimeout(timer)
  }, [draftReady, isOpen, persistDraft])

  useEffect(() => () => {
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopImmediatePropagation()
      closeStudio()
    }
    window.addEventListener("keydown", handleEscape, true)
    return () => window.removeEventListener("keydown", handleEscape, true)
  }, [closeStudio, isOpen])

  const callStudio = async (action: Exclude<BusyAction, "save" | null>, extra?: Record<string, unknown>) => {
    setBusyAction(action)
    setError("")
    setAssetsUsed(0)
    setAssetsFailed(0)
    try {
      const selectedAssetIds = action === "review" ? reviewAssetIds : referenceAssetIds
      const response = await fetch("/api/ai/creative-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          action,
          pieceContext,
          selectedAssetIds,
          inlineReferences: action === "review" ? [] : inlineReferences,
          ...extra,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo completar la acción")
      setAssetsUsed(Number(data?.assetsUsed || 0))
      setAssetsFailed(Number(data?.assetsFailed || 0))
      return data?.result
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo completar la acción")
      return null
    } finally {
      setBusyAction(null)
    }
  }

  const generateDirections = async () => {
    const result = await callStudio("directions") as CreativeDirectionsResult | null
    if (!result) return
    setDirectionsResult(result)
    setSelectedDirectionId(result.directions[0]?.id || "")
    setPromptPack(null)
    setReview(null)
    setActiveStep("directions")
  }

  const generatePrompt = async () => {
    if (!selectedDirection) {
      setError("Seleccioná una dirección creativa")
      return
    }
    const result = await callStudio("prompt", { selectedDirection }) as CreativePromptPack | null
    if (!result) return
    setPromptPack(result)
    setReview(null)
    setActiveStep("prompt")
  }

  const reviewResult = async () => {
    const result = await callStudio("review", { promptPack }) as CreativeReview | null
    if (!result) return
    setReview(result)
    setActiveStep("review")
  }

  const saveVersion = async () => {
    if (!promptPack) {
      setError("Generá un Prompt Pack antes de guardarlo")
      return
    }
    setBusyAction("save")
    setError("")
    try {
      const response = await fetch("/api/ai/creative-studio/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          pieceContext,
          directions: directionsResult?.directions || [],
          selectedDirection,
          promptPack,
          review,
          selectedAssetIds: Array.from(new Set([...referenceAssetIds, ...reviewAssetIds])),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || "No se pudo guardar la versión")
      const version = data.version as CreativePromptVersion
      setContext((current) => current ? {
        ...current,
        versions: [version, ...current.versions.filter((item) => item.id !== version.id)],
      } : current)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la versión")
    } finally {
      setBusyAction(null)
    }
  }

  const loadVersion = (version: CreativePromptVersion) => {
    const savedPiece = version.piece_context as CreativePieceContext & { exactText?: string }
    setPieceContext({
      ...EMPTY_CREATIVE_PIECE_CONTEXT,
      ...savedPiece,
      headlineText: savedPiece.headlineText || savedPiece.exactText || "",
      productionMode: savedPiece.productionMode || "photo-with-overlay",
    })
    setDirectionsResult({ directions: version.directions, contextGaps: [], assumptions: [] })
    setSelectedDirectionId(version.selected_direction?.id || version.directions[0]?.id || "")
    setPromptPack(normalizePromptPack(version.prompt_pack))
    setReview(normalizeReview(version.review))
    setReferenceAssetIds(version.source_asset_ids || [])
    setReviewAssetIds(version.review ? version.source_asset_ids || [] : [])
    setActiveStep(version.review ? "review" : "prompt")
    setError("")
  }

  const copyText = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(key)
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopiedField(""), 1600)
  }

  const toggleAsset = (assetId: string, mode: "reference" | "review") => {
    const setter = mode === "reference" ? setReferenceAssetIds : setReviewAssetIds
    setter((current) => current.includes(assetId)
      ? current.filter((id) => id !== assetId)
      : current.length >= 6 ? current : [...current, assetId])
  }

  const addInlineReferenceFiles = useCallback(async (files: File[]) => {
    const availableSlots = MAX_INLINE_REFERENCES - inlineReferences.length
    const candidates = files.filter((file) => file.type.startsWith("image/")).slice(0, availableSlots)
    if (!candidates.length) {
      setError(availableSlots <= 0 ? `Podés adjuntar hasta ${MAX_INLINE_REFERENCES} referencias pegadas` : "Pegá o seleccioná archivos de imagen")
      return
    }
    setReferenceBusy(true)
    setError("")
    try {
      const prepared = await Promise.allSettled(candidates.map(prepareInlineReference))
      const accepted = prepared.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])
      const rejected = prepared.flatMap((result) => result.status === "rejected" ? [String(result.reason?.message || result.reason)] : [])
      if (accepted.length) {
        setInlineReferences((current) => [...current, ...accepted].slice(0, MAX_INLINE_REFERENCES))
      }
      if (rejected.length) setError(rejected.join(" · "))
    } finally {
      setReferenceBusy(false)
    }
  }, [inlineReferences.length])

  useEffect(() => {
    if (!isOpen || activeStep !== "context") return
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"))
      if (!files.length) return
      event.preventDefault()
      void addInlineReferenceFiles(files)
    }
    window.addEventListener("paste", handlePaste, true)
    return () => window.removeEventListener("paste", handlePaste, true)
  }, [activeStep, addInlineReferenceFiles, isOpen])

  const promptProgress = promptPack ? 3 : directionsResult ? 2 : context ? 1 : 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={closeStudio} />
      <div role="dialog" aria-modal="true" aria-labelledby="creative-studio-title" className="relative flex h-[100svh] w-full flex-col overflow-hidden bg-[#0a0a0a] shadow-2xl sm:max-h-[94vh] sm:max-w-6xl sm:rounded-2xl sm:border sm:border-white/10">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-quepia-cyan/20 to-quepia-magenta/15 p-2">
              <Sparkles className="h-4 w-4 text-quepia-cyan" />
            </div>
            <div className="min-w-0">
              <h2 id="creative-studio-title" className="text-sm font-semibold text-white sm:text-base">Estudio Creativo IA</h2>
              <p className="truncate text-xs text-white/35">{context?.task.title || "Cargando tarea…"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("hidden text-[10px] sm:inline", draftStatus === "error" ? "text-amber-300/70" : "text-white/30")}>
              {draftStatus === "saving" ? "Guardando borrador…" : draftStatus === "saved" ? "Borrador guardado" : draftStatus === "error" ? "No se pudo guardar" : ""}
            </span>
            {promptPack && (
              <button
                type="button"
                onClick={() => void saveVersion()}
                disabled={busyAction !== null || context?.persistenceAvailable === false}
                className="hidden items-center gap-1.5 rounded-lg bg-quepia-cyan px-3 py-2 text-xs font-semibold text-black disabled:opacity-40 sm:flex"
              >
                {busyAction === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar versión
              </button>
            )}
            <button type="button" onClick={closeStudio} aria-label="Cerrar Estudio Creativo" className="rounded-lg p-2 text-white/45 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <aside className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-white/[0.02] p-2 sm:w-56 sm:flex-col sm:border-b-0 sm:border-r sm:p-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const active = activeStep === step.id
              const available = index <= promptProgress || step.id === "review"
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => available && setActiveStep(step.id)}
                  disabled={!available}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-25",
                    active ? "bg-quepia-cyan/10 text-quepia-cyan" : "text-white/45 hover:bg-white/5 hover:text-white/75",
                  )}
                >
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px]", active ? "bg-quepia-cyan text-black" : "bg-white/10")}>{index + 1}</span>
                  <Icon className="h-3.5 w-3.5" />
                  {step.label}
                </button>
              )
            })}

            {context && context.versions.length > 0 && (
              <div className="mt-2 border-t border-white/10 pt-3 sm:mt-auto">
                <p className="mb-2 hidden items-center gap-1.5 px-2 text-[10px] font-medium uppercase tracking-wide text-white/30 sm:flex">
                  <History className="h-3 w-3" /> Versiones
                </p>
                <div className="flex gap-1 overflow-x-auto sm:max-h-36 sm:flex-col sm:overflow-y-auto">
                  {context.versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => loadVersion(version)}
                      className="shrink-0 rounded-md px-2 py-1.5 text-left text-[11px] text-white/40 hover:bg-white/5 hover:text-white/70"
                    >
                      v{version.version_number} · {new Date(version.created_at).toLocaleDateString("es-AR")}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
            {loadingContext ? (
              <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-white/35">
                <Loader2 className="h-4 w-4 animate-spin text-quepia-cyan" /> Cargando brief y tarea…
              </div>
            ) : !context ? (
              <EmptyState icon={AlertCircle} title="No se pudo abrir el estudio" description={error || "Reintentá cargar el contexto."}>
                <button type="button" onClick={() => void loadContext()} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65 hover:bg-white/5">
                  <RefreshCw className="h-3.5 w-3.5" /> Reintentar
                </button>
              </EmptyState>
            ) : (
              <div className="mx-auto max-w-4xl">
                {activeStep === "context" && (
                  <ContextStep
                    context={context}
                    value={pieceContext}
                    onChange={setPieceContext}
                    selectedAssetIds={referenceAssetIds}
                    onToggleAsset={(id) => toggleAsset(id, "reference")}
                    inlineReferences={inlineReferences}
                    onAddInlineReferences={(files) => void addInlineReferenceFiles(files)}
                    onRemoveInlineReference={(id) => setInlineReferences((current) => current.filter((item) => item.id !== id))}
                    referenceBusy={referenceBusy}
                    onGenerate={() => void generateDirections()}
                    busy={busyAction === "directions"}
                  />
                )}

                {activeStep === "directions" && (
                  <DirectionsStep
                    result={directionsResult}
                    selectedId={selectedDirectionId}
                    onSelect={setSelectedDirectionId}
                    onBack={() => setActiveStep("context")}
                    onRegenerate={() => void generateDirections()}
                    onGeneratePrompt={() => void generatePrompt()}
                    busy={busyAction}
                  />
                )}

                {activeStep === "prompt" && (
                  <PromptStep
                    pack={promptPack}
                    onChange={setPromptPack}
                    onBack={() => setActiveStep("directions")}
                    onCopy={(key, text) => void copyText(key, text)}
                    copiedField={copiedField}
                    onSave={() => void saveVersion()}
                    saving={busyAction === "save"}
                    persistenceAvailable={context.persistenceAvailable}
                    onReview={() => setActiveStep("review")}
                  />
                )}

                {activeStep === "review" && (
                  <ReviewStep
                    assets={context.assets}
                    selectedAssetIds={reviewAssetIds}
                    onToggleAsset={(id) => toggleAsset(id, "review")}
                    review={review}
                    onReview={() => void reviewResult()}
                    busy={busyAction === "review"}
                    onCopy={(text) => void copyText("correction", text)}
                    copied={copiedField === "correction"}
                    hasPrompt={Boolean(promptPack)}
                  />
                )}

                {error && (
                  <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-400/20 bg-red-400/5 p-3 text-xs text-red-300">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                  </div>
                )}
                {!busyAction && (assetsUsed > 0 || assetsFailed > 0) && (
                  <p className="mt-3 text-[11px] text-white/25">
                    {assetsUsed > 0 && `${assetsUsed} asset(s) usados como contexto.`}
                    {assetsFailed > 0 && ` ${assetsFailed} no pudieron analizarse.`}
                  </p>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}

function ContextStep({ context, value, onChange, selectedAssetIds, onToggleAsset, inlineReferences, onAddInlineReferences, onRemoveInlineReference, referenceBusy, onGenerate, busy }: {
  context: CreativeStudioContextResponse
  value: CreativePieceContext
  onChange: (value: CreativePieceContext) => void
  selectedAssetIds: string[]
  onToggleAsset: (id: string) => void
  inlineReferences: CreativeInlineReference[]
  onAddInlineReferences: (files: File[]) => void
  onRemoveInlineReference: (id: string) => void
  referenceBusy: boolean
  onGenerate: () => void
  busy: boolean
}) {
  const update = <K extends keyof CreativePieceContext>(key: K, next: CreativePieceContext[K]) => onChange({ ...value, [key]: next })
  const brief = context.brief
  return (
    <div className="space-y-6">
      <SectionHeading title="Contexto de la pieza" description="La guía del cliente se usa como fuente de verdad. Acá solo definís lo específico de esta tarea." />

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-medium text-white/60">
          <Target className="h-3.5 w-3.5 text-quepia-cyan" /> Contexto de la tarea · siempre incluido
        </div>
        <p className="text-sm font-medium text-white/80">{context.task.title}</p>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/45">
          {context.task.description || "La tarea no tiene descripción."}
        </p>
      </div>

      <div className={cn("rounded-xl border p-4", brief ? "border-quepia-cyan/20 bg-quepia-cyan/[0.04]" : "border-amber-400/25 bg-amber-400/5")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-white">{brief?.brand_name || context.task.projectName || "Brief del cliente"}</p>
            <p className="mt-1 text-[11px] text-white/35">Guía de marca · solo lectura en este estudio</p>
          </div>
          <span className={cn("rounded-full border px-2 py-1 text-[10px]", brief ? "border-quepia-cyan/25 text-quepia-cyan" : "border-amber-400/25 text-amber-300")}>
            {brief ? `${context.briefCoverage.completed}/${context.briefCoverage.total} áreas completas` : "Sin brief"}
          </span>
        </div>
        {brief ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(brief.brand_personality || []).slice(0, 5).map((item) => <ContextChip key={item}>{item}</ContextChip>)}
            {(brief.visual_style_keywords || []).slice(0, 5).map((item) => <ContextChip key={item}>{item}</ContextChip>)}
            {(brief.color_palette || []).slice(0, 5).map((color, index) => (
              <span key={`${color.hex}-${index}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/45">
                <span className="h-2 w-2 rounded-full border border-white/10" style={{ backgroundColor: color.hex }} />{color.name || color.hex}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-amber-200/70">Creá el brief del cliente antes de generar direcciones.</p>
        )}
        {context.briefCoverage.missing.length > 0 && brief && (
          <p className="mt-3 text-[11px] text-white/30">Falta completar: {context.briefCoverage.missing.join(", ")}.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StudioInput label="Tipo de entregable" value={value.deliverableType} onChange={(next) => update("deliverableType", next)} placeholder="Ej. post, portada, fotografía de producto" />
        <StudioInput label="Plataforma" value={value.platform} onChange={(next) => update("platform", next)} placeholder="Ej. Instagram" />
        <StudioInput label="Formato" value={value.format} onChange={(next) => update("format", next)} placeholder="Ej. vertical 4:5 · 1080×1350" />
        <StudioSelect label="Modo de producción" value={value.productionMode} onChange={(next) => update("productionMode", next as CreativePieceContext["productionMode"])} options={PRODUCTION_OPTIONS} />
        <StudioSelect label="Modelo destino" value={value.modelTarget} onChange={(next) => update("modelTarget", next as CreativePieceContext["modelTarget"])} options={MODEL_OPTIONS} />
      </div>
      <StudioTextArea label="Objetivo específico" value={value.objective} onChange={(next) => update("objective", next)} placeholder="Qué debe comunicar o provocar esta pieza" />
      <StudioTextArea label="Qué necesitás ver" value={value.visualRequest} onChange={(next) => update("visualRequest", next)} placeholder="Escena, producto, personaje, metáfora o idea inicial. Puede quedar vacío si querés que la IA proponga." />
      <div className="grid gap-4 sm:grid-cols-2">
        <StudioTextArea label="Titular breve para el diseño" value={value.headlineText} onChange={(next) => update("headlineText", next)} placeholder="Ej. Cuando vacacionás y te quedás a vivir" />
        <StudioTextArea label="Excepciones de campaña" value={value.campaignExceptions} onChange={(next) => update("campaignExceptions", next)} placeholder="Solo reglas que deban prevalecer sobre la guía para esta pieza" />
      </div>
      <p className="rounded-lg border border-quepia-cyan/15 bg-quepia-cyan/[0.03] px-3 py-2 text-[11px] leading-4 text-white/40">
        El titular se agrega después en diseño. El copy/SEO de la tarea se usa para entender la idea, pero nunca se renderiza completo dentro de la imagen.
      </p>
      <StudioTextArea label="Lectura de referencias" value={value.referenceNotes} onChange={(next) => update("referenceNotes", next)} placeholder="Qué tomar de las referencias y qué no copiar" />

      <InlineReferenceSelector
        references={inlineReferences}
        onAdd={onAddInlineReferences}
        onRemove={onRemoveInlineReference}
        busy={referenceBusy}
      />

      {context.assets.length > 0 && (
        <AssetSelector title="Referencias que ya están en la tarea" hint="Opcional · también podés usar piezas existentes cuyo lenguaje visual deba considerarse." assets={context.assets} selectedIds={selectedAssetIds} onToggle={onToggleAsset} />
      )}

      <div className="flex items-center justify-between border-t border-white/10 pt-5">
        <label className="flex items-center gap-2 text-xs text-white/40">
          Idioma del prompt
          <select value={value.promptLanguage} onChange={(event) => update("promptLanguage", event.target.value as CreativePieceContext["promptLanguage"])} className="rounded-md border border-white/10 bg-[#181818] px-2 py-1.5 text-xs text-white/65 outline-none [color-scheme:dark]">
            <option value="en">Inglés</option>
            <option value="es">Español</option>
          </select>
        </label>
        <button type="button" onClick={onGenerate} disabled={busy || !brief} className="inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-35">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Crear 3 direcciones
        </button>
      </div>
    </div>
  )
}

function DirectionsStep({ result, selectedId, onSelect, onBack, onRegenerate, onGeneratePrompt, busy }: {
  result: CreativeDirectionsResult | null
  selectedId: string
  onSelect: (id: string) => void
  onBack: () => void
  onRegenerate: () => void
  onGeneratePrompt: () => void
  busy: BusyAction
}) {
  if (!result) return <EmptyState icon={Palette} title="Todavía no hay direcciones" description="Completá el contexto y generá tres rutas visuales."><button type="button" onClick={onBack} className="mt-4 text-xs text-quepia-cyan">Volver al contexto</button></EmptyState>
  return (
    <div className="space-y-6">
      <SectionHeading title="Direcciones creativas" description="Elegí una ruta conceptual antes de convertirla en instrucciones de producción." />
      {(result.contextGaps.length > 0 || result.assumptions.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.contextGaps.length > 0 && <InfoList title="Faltantes relevantes" items={result.contextGaps} tone="amber" />}
          {result.assumptions.length > 0 && <InfoList title="Supuestos usados" items={result.assumptions} />}
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {result.directions.map((direction, index) => {
          const selected = selectedId === direction.id
          return (
                <button key={direction.id} type="button" aria-pressed={selected} onClick={() => onSelect(direction.id)} className={cn("rounded-xl border p-4 text-left transition-colors", selected ? "border-quepia-cyan/45 bg-quepia-cyan/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/20")}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-white/25">Ruta {index + 1}</span>
                <span className={cn("flex h-4 w-4 items-center justify-center rounded-full border", selected ? "border-quepia-cyan bg-quepia-cyan text-black" : "border-white/20")}>{selected && <Check className="h-3 w-3" />}</span>
              </div>
              <h4 className="text-sm font-semibold text-white">{direction.title}</h4>
              <p className="mt-2 text-xs leading-5 text-white/55">{direction.concept}</p>
              <DirectionDetail label="Gancho social" value={direction.socialHook} />
              <DirectionDetail label="Titular sugerido" value={direction.headline} />
              <DirectionDetail label="Imagen base" value={direction.imagePlan} />
              <DirectionDetail label="Metáfora" value={direction.visualMetaphor} />
              <DirectionDetail label="Composición" value={direction.composition} />
              <DirectionDetail label="Lectura móvil" value={direction.mobileRead} />
              <DirectionDetail label="Estilo" value={direction.styleMood} />
              <DirectionDetail label="Marca" value={direction.brandConnection} />
              {direction.risk && <DirectionDetail label="Riesgo" value={direction.risk} tone="amber" />}
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <button type="button" onClick={onRegenerate} disabled={busy !== null} className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 disabled:opacity-40">
          {busy === "directions" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerar
        </button>
        <button type="button" onClick={onGeneratePrompt} disabled={!selectedId || busy !== null} className="inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-35">
          {busy === "prompt" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Crear Prompt Pack
        </button>
      </div>
    </div>
  )
}

function PromptStep({ pack, onChange, onBack, onCopy, copiedField, onSave, saving, persistenceAvailable, onReview }: {
  pack: CreativePromptPack | null
  onChange: (pack: CreativePromptPack) => void
  onBack: () => void
  onCopy: (key: string, text: string) => void
  copiedField: string
  onSave: () => void
  saving: boolean
  persistenceAvailable: boolean
  onReview: () => void
}) {
  if (!pack) return <EmptyState icon={FileText} title="Todavía no hay Prompt Pack" description="Elegí una dirección creativa para producirlo."><button type="button" onClick={onBack} className="mt-4 text-xs text-quepia-cyan">Volver a direcciones</button></EmptyState>
  const update = <K extends keyof CreativePromptPack>(key: K, value: CreativePromptPack[K]) => onChange({ ...pack, [key]: value })
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading title={pack.title} description={pack.rationale} />
        <button type="button" onClick={() => onCopy("all", formatPromptPack(pack))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:bg-white/5">
          {copiedField === "all" ? <Check className="h-3.5 w-3.5 text-quepia-cyan" /> : <Copy className="h-3.5 w-3.5" />} {copiedField === "all" ? "Copiado" : "Copiar todo"}
        </button>
      </div>
      <p className="rounded-lg border border-quepia-cyan/20 bg-quepia-cyan/[0.04] px-3 py-2 text-[11px] leading-4 text-white/45">
        Copiá al generador solamente el prompt de imagen base. El titular y el caption quedan separados para evitar texto largo, hashtags o errores tipográficos dentro de la imagen.
      </p>
      <PromptField label="Prompt para imagen base · sin texto" value={pack.visualPrompt} onChange={(value) => update("visualPrompt", value)} onCopy={() => onCopy("visual", pack.visualPrompt)} copied={copiedField === "visual"} rows={9} accent />
      <div className="grid gap-4 lg:grid-cols-2">
        <PromptField label="Reglas de marca" value={pack.brandRules} onChange={(value) => update("brandRules", value)} onCopy={() => onCopy("brand", pack.brandRules)} copied={copiedField === "brand"} />
        <PromptField label="Negative prompt" value={pack.negativePrompt} onChange={(value) => update("negativePrompt", value)} onCopy={() => onCopy("negative", pack.negativePrompt)} copied={copiedField === "negative"} />
        <PromptField label="Layout social y lectura móvil" value={pack.layoutNotes} onChange={(value) => update("layoutNotes", value)} onCopy={() => onCopy("layout", pack.layoutNotes)} copied={copiedField === "layout"} />
        <PromptField label="Titular para agregar en diseño" value={pack.exactCopy} onChange={(value) => update("exactCopy", value)} onCopy={() => onCopy("copy", pack.exactCopy)} copied={copiedField === "copy"} />
        <PromptField label="Qué queda solamente en el caption" value={pack.captionBoundary} onChange={(value) => update("captionBoundary", value)} onCopy={() => onCopy("caption", pack.captionBoundary)} copied={copiedField === "caption"} />
      </div>
      <PromptField label="Ajustes técnicos" value={pack.technicalSettings} onChange={(value) => update("technicalSettings", value)} onCopy={() => onCopy("technical", pack.technicalSettings)} copied={copiedField === "technical"} rows={3} />
      <PromptField label="Variaciones · una por línea" value={pack.variations.join("\n")} onChange={(value) => update("variations", value.split("\n").map((item) => item.trim()).filter(Boolean))} onCopy={() => onCopy("variations", pack.variations.join("\n"))} copied={copiedField === "variations"} rows={5} />
      <PromptField label="Checklist antes de publicar · uno por línea" value={pack.publishabilityChecklist.join("\n")} onChange={(value) => update("publishabilityChecklist", value.split("\n").map((item) => item.trim()).filter(Boolean))} onCopy={() => onCopy("checklist", pack.publishabilityChecklist.join("\n"))} copied={copiedField === "checklist"} rows={5} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
        <button type="button" onClick={onReview} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/55 hover:bg-white/5"><Eye className="h-3.5 w-3.5" /> Revisar un resultado</button>
        <button type="button" onClick={onSave} disabled={saving || !persistenceAvailable} title={!persistenceAvailable ? "Falta aplicar la migración del Estudio Creativo" : undefined} className="inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-35">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar versión
        </button>
      </div>
    </div>
  )
}

function ReviewStep({ assets, selectedAssetIds, onToggleAsset, review, onReview, busy, onCopy, copied, hasPrompt }: {
  assets: CreativeStudioContextResponse["assets"]
  selectedAssetIds: string[]
  onToggleAsset: (id: string) => void
  review: CreativeReview | null
  onReview: () => void
  busy: boolean
  onCopy: (text: string) => void
  copied: boolean
  hasPrompt: boolean
}) {
  return (
    <div className="space-y-6">
      <SectionHeading title="Revisión del resultado" description="Compará assets existentes contra la guía del cliente, la tarea y el Prompt Pack actual." />
      {assets.length > 0 ? (
        <AssetSelector title="Resultado a revisar" hint="Seleccioná hasta 6 assets. Para carruseles, podés incluir todas las diapositivas." assets={assets} selectedIds={selectedAssetIds} onToggle={onToggleAsset} />
      ) : (
        <EmptyState icon={ImageIcon} title="Todavía no hay assets" description="Subí el resultado a la tarea y volvé a abrir el Estudio Creativo." />
      )}
      {!hasPrompt && <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-200/70">La revisión usará la guía y la tarea. Generá un Prompt Pack si también querés comparar contra las instrucciones utilizadas.</p>}
      <div className="flex justify-end">
        <button type="button" onClick={onReview} disabled={busy || selectedAssetIds.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-quepia-cyan px-4 py-2.5 text-xs font-semibold text-black disabled:opacity-35">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Analizar resultado
        </button>
      </div>
      {review && (
        <div className="space-y-5 border-t border-white/10 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="max-w-2xl text-sm leading-6 text-white/65">{review.summary}</p>
            <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide", review.verdict === "publishable" ? "border-emerald-400/25 text-emerald-300" : review.verdict === "reject" ? "border-red-400/25 text-red-300" : "border-amber-400/25 text-amber-300")}>
              {review.verdict === "publishable" ? "Publicable" : review.verdict === "reject" ? "Rehacer" : "Necesita ajustes"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <ScoreCard label="Marca" value={review.scores.brandConsistency} />
            <ScoreCard label="Tarea" value={review.scores.taskAlignment} />
            <ScoreCard label="Redes" value={review.scores.socialPublishability} />
            <ScoreCard label="Móvil" value={review.scores.mobileLegibility} />
            <ScoreCard label="Naturalidad" value={review.scores.visualAuthenticity} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoList title="Qué funciona" items={review.strengths} tone="cyan" />
            <InfoList title="Qué corregir" items={review.issues} tone="amber" />
          </div>
          <div className="rounded-xl border border-quepia-cyan/20 bg-quepia-cyan/[0.04] p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-quepia-cyan">Prompt de corrección</p>
              <button type="button" onClick={() => onCopy(review.correctionPrompt)} className="inline-flex items-center gap-1 text-[11px] text-white/40 hover:text-white/70">{copied ? <Check className="h-3 w-3 text-quepia-cyan" /> : <Copy className="h-3 w-3" />}{copied ? "Copiado" : "Copiar"}</button>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-white/65">{review.correctionPrompt}</p>
          </div>
          {review.layoutCorrection && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <p className="mb-2 text-xs font-medium text-white/60">Corrección de titular y layout</p>
              <p className="whitespace-pre-wrap text-sm leading-6 text-white/55">{review.layoutCorrection}</p>
            </div>
          )}
          {review.nextSteps.length > 0 && <InfoList title="Próximos pasos" items={review.nextSteps} />}
        </div>
      )}
    </div>
  )
}

function InlineReferenceSelector({ references, onAdd, onRemove, busy }: {
  references: CreativeInlineReference[]
  onAdd: (files: File[]) => void
  onRemove: (id: string) => void
  busy: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-white/65">Referencias visuales pegadas</p>
          <p className="mt-1 text-[11px] text-white/30">Como en ChatGPT: pegá imágenes con ⌘V y explicá arriba qué tomar y qué cambiar.</p>
        </div>
        <span className="text-[11px] text-white/30">{references.length}/{MAX_INLINE_REFERENCES}</span>
      </div>
      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          onAdd(Array.from(event.dataTransfer.files))
        }}
        className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3"
      >
        {references.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {references.map((reference) => (
              <div key={reference.id} className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/30">
                <div role="img" aria-label={reference.name} className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${reference.dataUrl})` }} />
                <button type="button" onClick={() => onRemove(reference.id)} aria-label={`Quitar ${reference.name}`} className="absolute right-1.5 top-1.5 rounded-md bg-black/75 p-1 text-white/60 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
                <p className="truncate px-2 py-1.5 text-[10px] text-white/40">{reference.name}</p>
              </div>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(event) => {
            onAdd(Array.from(event.target.files || []))
            event.target.value = ""
          }}
        />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy || references.length >= MAX_INLINE_REFERENCES} className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs text-white/45 hover:bg-white/5 hover:text-white/70 disabled:opacity-35">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {busy ? "Preparando referencias…" : "Pegar, arrastrar o seleccionar imágenes"}
        </button>
      </div>
    </div>
  )
}

function AssetSelector({ title, hint, assets, selectedIds, onToggle }: {
  title: string
  hint: string
  assets: CreativeStudioContextResponse["assets"]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3"><div><p className="text-xs font-medium text-white/65">{title}</p><p className="mt-1 text-[11px] text-white/25">{hint}</p></div><span className="text-[11px] text-white/30">{selectedIds.length}/6</span></div>
      <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-3">
        {assets.map((asset) => {
          const selected = selectedIds.includes(asset.id)
          return <button key={asset.versionId} type="button" aria-pressed={selected} onClick={() => onToggle(asset.id)} className={cn("inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] transition-colors", selected ? "border-quepia-cyan/35 bg-quepia-cyan/10 text-white/75" : "border-white/10 text-white/35 hover:text-white/60")}><Paperclip className="h-3 w-3" /><span className="truncate">{asset.name}</span>{asset.assetType === "carousel" && <span className="text-white/25">#{asset.groupOrder + 1}</span>}<span className={cn("h-1.5 w-1.5 rounded-full", asset.analysisStatus === "ready" ? "bg-emerald-400" : "bg-amber-300")} /></button>
        })}
      </div>
    </div>
  )
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return <div><h3 className="text-lg font-semibold text-white">{title}</h3><p className="mt-1 max-w-2xl text-sm leading-5 text-white/40">{description}</p></div>
}

function StudioInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-quepia-cyan/45" /></label>
}

function StudioTextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full resize-y rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-white/20 focus:border-quepia-cyan/45" /></label>
}

function StudioSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: ReadonlyArray<readonly [string, string]> }) {
  return <label className="block"><span className="mb-2 block text-xs font-medium text-white/60">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-white/10 bg-[#181818] px-3 py-2.5 text-sm text-white outline-none focus:border-quepia-cyan/45 [color-scheme:dark]">{options.map(([key, labelText]) => <option key={key} value={key}>{labelText}</option>)}</select></label>
}

function ContextChip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/45">{children}</span>
}

function DirectionDetail({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  if (!value) return null
  return <div className="mt-3"><p className={cn("text-[10px] font-medium uppercase tracking-wide", tone === "amber" ? "text-amber-300/65" : "text-white/25")}>{label}</p><p className="mt-1 text-[11px] leading-4 text-white/45">{value}</p></div>
}

function PromptField({ label, value, onChange, onCopy, copied, rows = 5, accent = false }: { label: string; value: string; onChange: (value: string) => void; onCopy: () => void; copied: boolean; rows?: number; accent?: boolean }) {
  return <div className={cn("rounded-xl border p-3", accent ? "border-quepia-cyan/20 bg-quepia-cyan/[0.03]" : "border-white/10 bg-white/[0.02]")}><div className="mb-2 flex items-center justify-between text-xs font-medium text-white/60"><span>{label}</span><button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-[10px] text-white/30 hover:text-white/65">{copied ? <Check className="h-3 w-3 text-quepia-cyan" /> : <Copy className="h-3 w-3" />}{copied ? "Copiado" : "Copiar"}</button></div><textarea aria-label={label} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="w-full resize-y bg-transparent text-sm leading-6 text-white/70 outline-none" /></div>
}

function InfoList({ title, items, tone = "default" }: { title: string; items: string[]; tone?: "default" | "amber" | "cyan" }) {
  if (!items.length) return null
  return <div className={cn("rounded-xl border p-4", tone === "amber" ? "border-amber-400/20 bg-amber-400/[0.04]" : tone === "cyan" ? "border-quepia-cyan/20 bg-quepia-cyan/[0.04]" : "border-white/10 bg-white/[0.02]")}><p className={cn("text-xs font-medium", tone === "amber" ? "text-amber-200/75" : tone === "cyan" ? "text-quepia-cyan" : "text-white/55")}>{title}</p><ul className="mt-2 space-y-1.5">{items.map((item, index) => <li key={`${item}-${index}`} className="flex gap-2 text-[11px] leading-4 text-white/45"><ChevronRight className="mt-0.5 h-3 w-3 shrink-0" />{item}</li>)}</ul></div>
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center"><p className="text-2xl font-semibold text-white">{value}<span className="text-xs font-normal text-white/25">/5</span></p><p className="mt-1 text-[10px] uppercase tracking-wide text-white/30">{label}</p></div>
}

function EmptyState({ icon: Icon, title, description, children }: { icon: typeof AlertCircle; title: string; description: string; children?: React.ReactNode }) {
  return <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 p-8 text-center"><Icon className="mb-3 h-6 w-6 text-white/25" /><p className="text-sm font-medium text-white/65">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-white/30">{description}</p>{children}</div>
}
