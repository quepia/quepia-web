"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/sistema/supabase/client"
import type {
  CompetitorAnalysisContent,
  CompetitorCategory,
  CompetitorResearchContext,
  ProjectCompetitor,
  ResearchRun,
  ResearchSource,
  StrategyDocument,
  StrategyNarrativeContent,
  StrategyDocumentStatus,
  StrategyOpportunity,
} from "@/types/sistema"

type SupabaseErrorLike = {
  code?: string
  message?: string
}

function isMissingIntelligenceSchema(error: unknown) {
  const candidate = error && typeof error === "object" ? error as SupabaseErrorLike : null
  return candidate?.code === "42P01"
    || candidate?.code === "PGRST204"
    || candidate?.code === "PGRST205"
    || /sistema_(competitors|strategy_documents|opportunities|research_runs)/i.test(candidate?.message || "")
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as SupabaseErrorLike).message || fallback)
  }
  return error instanceof Error ? error.message : fallback
}

function normalizeWebsite(value: string) {
  const raw = value.trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

export function useProjectIntelligence(projectId: string | null) {
  const [competitors, setCompetitors] = useState<ProjectCompetitor[]>([])
  const [documents, setDocuments] = useState<Array<StrategyDocument<CompetitorAnalysisContent | StrategyNarrativeContent>>>([])
  const [activeDocuments, setActiveDocuments] = useState<Array<StrategyDocument<CompetitorAnalysisContent | StrategyNarrativeContent>>>([])
  const [document, setDocument] = useState<StrategyDocument<CompetitorAnalysisContent> | null>(null)
  const [sources, setSources] = useState<ResearchSource[]>([])
  const [opportunities, setOpportunities] = useState<StrategyOpportunity[]>([])
  const [latestRun, setLatestRun] = useState<ResearchRun | null>(null)
  const [loading, setLoading] = useState(Boolean(projectId))
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupRequired, setSetupRequired] = useState(false)
  const requestRef = useRef(0)

  const refresh = useCallback(async () => {
    const targetProjectId = projectId
    const requestId = ++requestRef.current
    if (!targetProjectId) {
      setCompetitors([])
      setDocuments([])
      setActiveDocuments([])
      setDocument(null)
      setSources([])
      setOpportunities([])
      setLatestRun(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const [competitorsResult, documentsResult, runResult] = await Promise.all([
        supabase
          .from("sistema_competitors")
          .select("*")
          .eq("project_id", targetProjectId)
          .eq("is_active", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("sistema_strategy_documents")
          .select("*")
          .eq("project_id", targetProjectId)
          .order("version", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("sistema_research_runs")
          .select("*")
          .eq("project_id", targetProjectId)
          .eq("research_type", "competitor_analysis")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const firstError = competitorsResult.error || documentsResult.error || runResult.error
      if (firstError) throw firstError

      const latestByType = new Map<string, StrategyDocument<CompetitorAnalysisContent | StrategyNarrativeContent>>()
      const activeByType = new Map<string, StrategyDocument<CompetitorAnalysisContent | StrategyNarrativeContent>>()
      for (const strategyDocument of (documentsResult.data || []) as Array<StrategyDocument<CompetitorAnalysisContent | StrategyNarrativeContent>>) {
        if (!latestByType.has(strategyDocument.document_type)) {
          latestByType.set(strategyDocument.document_type, strategyDocument)
        }
        if (
          !activeByType.has(strategyDocument.document_type)
          && (strategyDocument.status === "reviewed" || strategyDocument.status === "published")
        ) {
          activeByType.set(strategyDocument.document_type, strategyDocument)
        }
      }
      const latestDocuments = Array.from(latestByType.values())
      const latestDocument = (latestByType.get("competitor_analysis") || null) as StrategyDocument<CompetitorAnalysisContent> | null
      const sourceRunId = latestDocument?.source_run_id || latestDocuments[0]?.source_run_id || null
      const [sourcesResult, opportunitiesResult] = await Promise.all([
        sourceRunId
          ? supabase
            .from("sistema_research_sources")
            .select("*")
            .eq("run_id", sourceRunId)
            .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        latestDocument
          ? supabase
            .from("sistema_opportunities")
            .select("*")
            .eq("document_id", latestDocument.id)
            .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (sourcesResult.error) throw sourcesResult.error
      if (opportunitiesResult.error) throw opportunitiesResult.error
      if (requestRef.current !== requestId) return

      setCompetitors((competitorsResult.data || []) as ProjectCompetitor[])
      setDocuments(latestDocuments)
      setActiveDocuments(Array.from(activeByType.values()))
      setDocument(latestDocument)
      setSources((sourcesResult.data || []) as ResearchSource[])
      setOpportunities((opportunitiesResult.data || []) as StrategyOpportunity[])
      setLatestRun((runResult.data || null) as ResearchRun | null)
      setSetupRequired(false)
    } catch (loadError) {
      if (requestRef.current !== requestId) return
      const missingSchema = isMissingIntelligenceSchema(loadError)
      setSetupRequired(missingSchema)
      setError(missingSchema
        ? "Falta aplicar la migración de Inteligencia en Supabase."
        : errorMessage(loadError, "No se pudo cargar Inteligencia."))
    } finally {
      if (requestRef.current === requestId) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addCompetitor = useCallback(async (input: {
    name: string
    website: string
    category: CompetitorCategory
    notes?: string
  }) => {
    if (!projectId) return false
    const name = input.name.trim()
    if (!name) {
      setError("El nombre del competidor es obligatorio.")
      return false
    }

    const website = input.website.trim() ? normalizeWebsite(input.website) : null
    if (input.website.trim() && !website) {
      setError("Ingresá una URL válida para el competidor.")
      return false
    }

    try {
      setError(null)
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) throw new Error("No autorizado")

      const { error: insertError } = await supabase
        .from("sistema_competitors")
        .insert({
          project_id: projectId,
          name,
          website_url: website,
          category: input.category,
          notes: input.notes?.trim() || null,
          created_by: authData.user.id,
        })

      if (insertError) {
        if (insertError.code !== "23505") throw insertError
        const { data: existingRows, error: existingError } = await supabase
          .from("sistema_competitors")
          .select("id, name, is_active")
          .eq("project_id", projectId)
        if (existingError) throw existingError
        const existing = existingRows?.find((competitor) =>
          competitor.name.localeCompare(name, "es", { sensitivity: "base" }) === 0
        )
        if (!existing || existing.is_active) throw new Error("Ese competidor ya está cargado.")
        const { error: reactivateError } = await supabase
          .from("sistema_competitors")
          .update({
            is_active: true,
            website_url: website,
            category: input.category,
            notes: input.notes?.trim() || null,
          })
          .eq("id", existing.id)
        if (reactivateError) throw reactivateError
      }

      await refresh()
      return true
    } catch (mutationError) {
      setError(errorMessage(mutationError, "No se pudo agregar el competidor."))
      return false
    }
  }, [projectId, refresh])

  const removeCompetitor = useCallback(async (competitorId: string) => {
    try {
      setError(null)
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from("sistema_competitors")
        .update({ is_active: false })
        .eq("id", competitorId)
      if (updateError) throw updateError
      setCompetitors((current) => current.filter((competitor) => competitor.id !== competitorId))
      return true
    } catch (mutationError) {
      setError(errorMessage(mutationError, "No se pudo quitar el competidor."))
      return false
    }
  }, [])

  const generateAnalysis = useCallback(async (researchContext: CompetitorResearchContext) => {
    if (!projectId || generating) return false
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch("/api/ai/competitor-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, researchContext }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "No se pudo generar el análisis.")
      await refresh()
      return true
    } catch (generationError) {
      setError(errorMessage(generationError, "No se pudo generar el análisis."))
      return false
    } finally {
      setGenerating(false)
    }
  }, [generating, projectId, refresh])

  const updateDocumentStatus = useCallback(async (documentId: string, status: StrategyDocumentStatus) => {
    if (!documentId) return false
    try {
      setError(null)
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) throw new Error("No autorizado")
      const timestamp = new Date().toISOString()
      const updates: Record<string, unknown> = { status }
      if (status === "reviewed") {
        updates.reviewed_by = authData.user.id
        updates.reviewed_at = timestamp
      }
      if (status === "published") {
        updates.published_by = authData.user.id
        updates.published_at = timestamp
      }

      const { error: updateError } = await supabase
        .from("sistema_strategy_documents")
        .update(updates)
        .eq("id", documentId)
      if (updateError) throw updateError
      await refresh()
      return true
    } catch (mutationError) {
      setError(errorMessage(mutationError, "No se pudo actualizar el estado del análisis."))
      return false
    }
  }, [refresh])

  const createTaskFromOpportunity = useCallback(async (opportunity: StrategyOpportunity) => {
    if (!projectId || opportunity.linked_task_id) return null
    try {
      setError(null)
      const supabase = createClient()
      const { data: column, error: columnError } = await supabase
        .from("sistema_columns")
        .select("id")
        .eq("project_id", projectId)
        .order("orden", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (columnError) throw columnError
      if (!column) throw new Error("El proyecto no tiene columnas para crear la tarea.")

      const { data: lastTask, error: orderError } = await supabase
        .from("sistema_tasks")
        .select("orden")
        .eq("column_id", column.id)
        .order("orden", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (orderError) throw orderError

      const evidenceText = opportunity.evidence.length > 0
        ? `\n\nFuentes:\n${opportunity.evidence.map((url) => `- ${url}`).join("\n")}`
        : ""
      const priority = opportunity.impact === "high" ? "P1" : opportunity.impact === "medium" ? "P2" : "P3"

      const { data: task, error: taskError } = await supabase
        .from("sistema_tasks")
        .insert({
          project_id: projectId,
          column_id: column.id,
          titulo: opportunity.title,
          descripcion: `${opportunity.description}${evidenceText}`,
          priority,
          labels: ["Estrategia", "Competencia"],
          task_type: "strategy",
          orden: (lastTask?.orden ?? -1) + 1,
        })
        .select("id")
        .single()
      if (taskError || !task) throw taskError || new Error("No se pudo crear la tarea.")

      const { error: opportunityError } = await supabase
        .from("sistema_opportunities")
        .update({ linked_task_id: task.id, status: "planned" })
        .eq("id", opportunity.id)
      if (opportunityError) throw opportunityError

      setOpportunities((current) => current.map((item) =>
        item.id === opportunity.id
          ? { ...item, linked_task_id: task.id, status: "planned" }
          : item
      ))
      return task.id as string
    } catch (mutationError) {
      setError(errorMessage(mutationError, "No se pudo crear la tarea."))
      return null
    }
  }, [projectId])

  const dismissOpportunity = useCallback(async (opportunityId: string) => {
    try {
      setError(null)
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from("sistema_opportunities")
        .update({ status: "dismissed" })
        .eq("id", opportunityId)
      if (updateError) throw updateError
      setOpportunities((current) => current.map((item) =>
        item.id === opportunityId ? { ...item, status: "dismissed" } : item
      ))
      return true
    } catch (mutationError) {
      setError(errorMessage(mutationError, "No se pudo descartar la oportunidad."))
      return false
    }
  }, [])

  return {
    competitors,
    documents,
    activeDocuments,
    document,
    sources,
    opportunities,
    latestRun,
    loading,
    generating,
    error,
    setupRequired,
    refresh,
    addCompetitor,
    removeCompetitor,
    generateAnalysis,
    updateDocumentStatus,
    createTaskFromOpportunity,
    dismissOpportunity,
  }
}
