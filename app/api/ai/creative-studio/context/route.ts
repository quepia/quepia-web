import { NextResponse } from "next/server"
import {
  getBriefCoverage,
  loadCreativeStudioAssets,
  loadCreativeStudioSource,
} from "@/lib/ai/creative-studio-context"
import type { CreativePromptVersion } from "@/lib/ai/creative-studio-types"
import { createClient } from "@/lib/sistema/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cleanTaskId(value: string | null) {
  return typeof value === "string" ? value.trim().slice(0, 100) : ""
}
function isMissingVersionsTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || /sistema_creative_prompt_versions/i.test(error?.message || "")
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const taskId = cleanTaskId(new URL(request.url).searchParams.get("taskId"))
    if (!taskId) return NextResponse.json({ error: "Falta la tarea" }, { status: 400 })

    const source = await loadCreativeStudioSource(supabase, taskId)
    if (!source) {
      return NextResponse.json({ error: "No se encontró la tarea o no tenés acceso" }, { status: 404 })
    }

    const [assets, versionsResult] = await Promise.all([
      loadCreativeStudioAssets(supabase, taskId),
      supabase
        .from("sistema_creative_prompt_versions")
        .select("*")
        .eq("task_id", taskId)
        .order("version_number", { ascending: false })
        .limit(20),
    ])

    if (versionsResult.error && !isMissingVersionsTable(versionsResult.error)) {
      throw versionsResult.error
    }

    return NextResponse.json({
      ...source,
      briefCoverage: getBriefCoverage(source.brief),
      assets,
      versions: (versionsResult.data || []) as CreativePromptVersion[],
      persistenceAvailable: !versionsResult.error,
    })
  } catch (error) {
    console.error("[CreativeStudioContext] Error:", error)
    return NextResponse.json({ error: "No se pudo cargar el Estudio Creativo" }, { status: 500 })
  }
}
