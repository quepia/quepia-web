import { NextResponse } from "next/server"
import { createTextStreamResponse, streamText, toTextStream } from "ai"
import { vertexModel } from "@/lib/ai/vertex"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ACTION_INSTRUCTIONS = {
  generate: "Escribí un copy final listo para publicar, claro, atractivo y con un CTA natural.",
  improve: "Mejorá el copy actual sin perder su intención, tono ni datos importantes.",
  variants: "Creá tres variantes claramente separadas: Concisa, Emocional y Comercial.",
  instagram: "Adaptá el copy para Instagram: apertura atractiva, lectura escaneable, CTA y hashtags relevantes sin exceso.",
  linkedin: "Adaptá el copy para LinkedIn: profesional, humano, con párrafos breves y un CTA apropiado.",
  facebook: "Adaptá el copy para Facebook: cercano, claro, conversacional y con un CTA sencillo.",
  review: "Hacé una revisión editorial. Devolvé secciones breves: Hallazgos, Riesgos o faltantes y Versión sugerida. No inventes datos.",
} as const

type CopilotAction = keyof typeof ACTION_INSTRUCTIONS

function cleanInput(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const action = body?.action as CopilotAction
    if (!action || !(action in ACTION_INSTRUCTIONS)) {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 })
    }

    const title = cleanInput(body?.title, 300)
    const description = cleanInput(body?.description, 4_000)
    const currentCopy = cleanInput(body?.currentCopy, 6_000)
    const projectName = cleanInput(body?.projectName, 200)

    if (!title && !description && !currentCopy) {
      return NextResponse.json({ error: "La tarea no tiene contenido suficiente" }, { status: 400 })
    }

    const result = streamText({
      model: vertexModel,
      system: [
        "Sos un redactor y editor senior de una agencia creativa argentina.",
        "Respondé en español rioplatense natural, salvo que el contenido original use otro idioma.",
        "No inventes beneficios, cifras, ubicaciones, enlaces ni afirmaciones que no estén en el contexto.",
        "Entregá solo el resultado solicitado, sin introducciones sobre tu proceso.",
      ].join(" "),
      prompt: [
        `Tarea: ${ACTION_INSTRUCTIONS[action]}`,
        projectName ? `Marca o proyecto: ${projectName}` : "",
        title ? `Título de la tarea:\n${title}` : "",
        description ? `Descripción / brief:\n${description}` : "",
        currentCopy ? `Copy actual:\n${currentCopy}` : "Copy actual: vacío",
      ].filter(Boolean).join("\n\n"),
      onError: ({ error }) => console.error("[ContentCopilot] Streaming error:", error),
    })

    return createTextStreamResponse({ stream: toTextStream({ stream: result.stream }) })
  } catch (error) {
    console.error("[ContentCopilot] Error:", error)
    return NextResponse.json({ error: "No se pudo generar el contenido" }, { status: 500 })
  }
}
