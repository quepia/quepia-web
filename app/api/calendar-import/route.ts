import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// GET: Fetch all calendar events for a user (bypasses RLS)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Check if user is a global admin
    const { data: globalUser } = await supabase
      .from("sistema_users")
      .select("role")
      .eq("id", userId)
      .single()

    const isGlobalAdmin = globalUser?.role === "admin"

    let projectIds: string[] = []

    if (isGlobalAdmin) {
      // Global admins can see all projects
      const { data: allProjects } = await supabase
        .from("sistema_projects")
        .select("id")

      projectIds = (allProjects || []).map((p: any) => p.id)
    } else {
      // Get projects user owns
      const { data: ownedProjects } = await supabase
        .from("sistema_projects")
        .select("id")
        .eq("owner_id", userId)

      // Get projects user is a member of
      const { data: memberProjects } = await supabase
        .from("sistema_project_members")
        .select("project_id")
        .eq("user_id", userId)

      const ownedIds = (ownedProjects || []).map((p: any) => p.id)
      const memberIds = (memberProjects || []).map((p: any) => p.project_id)
      projectIds = [...new Set([...ownedIds, ...memberIds])]
    }

    if (projectIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    const { data, error } = await supabase
      .from("sistema_calendar_events")
      .select(`
        *,
        project:sistema_projects(id, nombre, color)
      `)
      .in("project_id", projectIds)
      .order("fecha_inicio", { ascending: true })

    if (error) {
      console.error("Calendar fetch error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ events: data || [] })
  } catch (err) {
    console.error("Calendar fetch error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { events, projectId, userId } = await request.json()

    if (!events || !projectId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Verify user owns or is member of the project
    const { data: project } = await supabase
      .from("sistema_projects")
      .select("id, owner_id")
      .eq("id", projectId)
      .single()

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    if (project.owner_id !== userId) {
      // Check if user is a global admin
      const { data: globalUser } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      const isGlobalAdmin = globalUser?.role === "admin"

      if (!isGlobalAdmin) {
        // Check if user is a project member
        const { data: member } = await supabase
          .from("sistema_project_members")
          .select("id")
          .eq("project_id", projectId)
          .eq("user_id", userId)
          .maybeSingle()

        if (!member) {
          return NextResponse.json({ error: "No permission" }, { status: 403 })
        }
      }
    }

    // Bulk insert all events
    const rows = events.map((ev: any) => ({
      project_id: projectId,
      titulo: ev.titulo,
      descripcion: ev.descripcion,
      tipo: ev.tipo || "publicacion",
      fecha_inicio: ev.fecha_inicio,
      todo_el_dia: ev.todo_el_dia ?? true,
      color: ev.color || "#22c55e",
      created_by: userId,
    }))

    const { data, error } = await supabase
      .from("sistema_calendar_events")
      .insert(rows)
      .select("id")

    if (error) {
      console.error("Calendar import error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: data?.length ?? 0 })
  } catch (err) {
    console.error("Calendar import error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
