import { NextResponse } from "next/server"
import { createClient } from "@/lib/sistema/supabase/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"

const BUCKET_NAME = "project-images"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const server = await createClient()
    const {
      data: { user },
      error: authError,
    } = await server.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const path = String(body?.path || "").trim()

    if (!path) {
      return NextResponse.json({ error: "Path inválido" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin.storage.from(BUCKET_NAME).remove([path])
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado al eliminar imagen"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
