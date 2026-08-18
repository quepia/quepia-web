import { NextResponse } from "next/server"
import { generateText, jsonSchema, Output } from "ai"
import { formatBrandGuidelines } from "@/lib/ai/creative-studio-context"
import {
  formatActiveStrategyContext,
  loadActiveStrategyDocuments,
} from "@/lib/ai/project-strategy-context"
import { vertexModel } from "@/lib/ai/vertex"
import { createClient } from "@/lib/sistema/supabase/server"
import type { ClientBrief } from "@/types/sistema"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

interface CalendarEventOutput {
  date: string
  pillar: string
  format: string
  topic: string
  copy_suggestion: string
}

const eventSchema = jsonSchema<CalendarEventOutput>({
  type: "object",
  additionalProperties: false,
  required: ["date", "pillar", "format", "topic", "copy_suggestion"],
  properties: {
    date: { type: "string", description: "Fecha ISO exacta, en formato YYYY-MM-DD" },
    pillar: { type: "string", description: "Pilar de contenido" },
    format: { type: "string", description: "Formato de la publicación" },
    topic: { type: "string", description: "Título o idea concreta del contenido" },
    copy_suggestion: { type: "string", description: "Copy sugerido, listo para revisar" },
  },
})

function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function cleanEvents(value: unknown): CalendarEventOutput[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const candidate = item as Record<string, unknown>
    const event = {
      date: cleanString(candidate.date, 10),
      pillar: cleanString(candidate.pillar, 100),
      format: cleanString(candidate.format, 60),
      topic: cleanString(candidate.topic, 300),
      copy_suggestion: cleanString(candidate.copy_suggestion, 2_000),
    }
    return Object.values(event).every(Boolean) ? [event] : []
  })
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await request.json()
    const prompt = cleanString(body?.prompt, 8_000)
    const projectId = cleanString(body?.projectId, 100)
    const feedback = cleanString(body?.feedback, 2_000)
    const currentEvents = cleanEvents(body?.events)

    if (!prompt) {
      return NextResponse.json({ error: "Falta el brief del calendario" }, { status: 400 })
    }
    if (!projectId) {
      return NextResponse.json({ error: "Elegí el cliente para aplicar su brief y estrategia" }, { status: 400 })
    }
    if (body?.events !== undefined && (!feedback || currentEvents.length === 0)) {
      return NextResponse.json({ error: "Faltan el calendario actual o las indicaciones de cambio" }, { status: 400 })
    }

    const [projectResult, briefResult, activeStrategyDocuments] = await Promise.all([
      supabase
        .from("sistema_projects")
        .select("id, nombre")
        .eq("id", projectId)
        .maybeSingle(),
      supabase
        .from("sistema_client_briefs")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle(),
      loadActiveStrategyDocuments(supabase, projectId),
    ])
    if (projectResult.error || !projectResult.data) {
      return NextResponse.json({ error: "No se encontró el cliente o no tenés acceso" }, { status: 404 })
    }
    if (briefResult.error) throw briefResult.error

    const brandContext = formatBrandGuidelines(briefResult.data ? briefResult.data as ClientBrief : null)
    const activeStrategyContext = formatActiveStrategyContext(activeStrategyDocuments)
    const revisionContext = currentEvents.length
      ? [
          "Revisá el calendario actual según el feedback. Conservá lo que no haya que cambiar y devolvé el calendario completo, no solo las modificaciones.",
          `Feedback del usuario:\n${feedback}`,
          `Calendario actual:\n${JSON.stringify(currentEvents)}`,
        ].join("\n\n")
      : "Creá el calendario solicitado desde cero."

    const { output } = await generateText({
      model: vertexModel,
      output: Output.array({ element: eventSchema }),
      system: [
        "Sos un estratega senior de contenidos de una agencia creativa argentina.",
        "Generá ideas específicas, variadas y accionables, en español natural.",
        "Jerarquía de contexto: el pedido explícito manda; el brief es la fuente de verdad de la marca; la estrategia aprobada orienta sin contradecirlos.",
        "Respetá estrictamente el mes, la frecuencia, las plataformas y los pilares indicados.",
        "Usá únicamente fechas reales dentro del mes solicitado y ordenalas cronológicamente.",
        "No inventes afirmaciones, promociones, precios ni datos de la marca que no estén en el brief.",
      ].join(" "),
      prompt: [
        brandContext,
        activeStrategyContext,
        `CLIENTE SELECCIONADO\n${projectResult.data.nombre}`,
        `PEDIDO DEL CALENDARIO\n${prompt}`,
        revisionContext,
      ].filter(Boolean).join("\n\n"),
    })

    return NextResponse.json({
      events: output,
      context: {
        briefConnected: Boolean(briefResult.data),
        activeStrategyCount: activeStrategyDocuments.length,
      },
    })
  } catch (error) {
    console.error("[AICalendar] Error:", error)
    return NextResponse.json({ error: "No se pudo generar el calendario. Intentá nuevamente." }, { status: 500 })
  }
}
