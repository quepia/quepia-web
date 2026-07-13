import { NextResponse } from "next/server"
import { getTaskAssetContexts, MAX_COPILOT_ASSETS } from "@/lib/ai/content-copilot-assets"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanTaskId(value: string | null) {
  return typeof value === "string" ? value.trim().slice(0, 100) : ""
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const taskId = cleanTaskId(new URL(request.url).searchParams.get("taskId"))
    if (!taskId) return NextResponse.json({ error: "Falta la tarea" }, { status: 400 })

    const { data: task, error: taskError } = await supabase
      .from("sistema_tasks")
      .select("id")
      .eq("id", taskId)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: "No se encontró la tarea o no tenés acceso" }, { status: 404 })
    }

    const contexts = await getTaskAssetContexts(supabase, taskId)
    return NextResponse.json({
      maxAssets: MAX_COPILOT_ASSETS,
      assets: contexts.map((context) => ({
        id: context.assetId,
        versionId: context.versionId,
        name: context.name,
        filename: context.filename,
        assetType: context.assetType,
        groupId: context.groupId,
        groupOrder: context.groupOrder,
        fileType: context.fileType,
        status: context.analysis ? "ready" : "pending",
        analyzedAt: context.analyzedAt,
      })),
    })
  } catch (error) {
    console.error("[ContentCopilotContext] Error:", error)
    return NextResponse.json({ error: "No se pudieron cargar los assets" }, { status: 500 })
  }
}
