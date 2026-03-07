import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { syncEfemeridesCalendarioActual } from "@/lib/sistema/actions/efemerides"

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

export const dynamic = "force-dynamic"

const PROJECT_IDS_CACHE_TTL_MS = 45_000
const projectIdsCache = new Map<string, { projectIds: string[]; expiresAt: number }>()
type ProjectIdRow = { id: string }
type MemberProjectIdRow = { project_id: string }

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getCachedProjectIds(userId: string) {
  const cached = projectIdsCache.get(userId)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    projectIdsCache.delete(userId)
    return null
  }
  return cached.projectIds
}

function setCachedProjectIds(userId: string, projectIds: string[]) {
  projectIdsCache.set(userId, {
    projectIds,
    expiresAt: Date.now() + PROJECT_IDS_CACHE_TTL_MS,
  })
}

// GET: Fetch tasks, projects, and calendar events for a user (bypasses RLS)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const type = searchParams.get("type") // "tasks" | "projects" | "events"
    const forceRefresh = searchParams.get("force") === "true"

    if (!type) {
      return NextResponse.json({ error: "Missing type" }, { status: 400 })
    }

    const supabase = getAdminClient()

    // Helper to get all project IDs accessible by user (owned + member)
    const getUserProjectIds = async (userId: string, bypassCache = false) => {
      const cachedProjectIds = bypassCache ? null : getCachedProjectIds(userId)
      if (cachedProjectIds && !bypassCache) {
        return cachedProjectIds
      }

      // 1. Get user role
      const { data: user, error: userError } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (userError && userError.code !== "PGRST116") {
        throw userError
      }

      // 2. If Admin, get ALL project IDs
      if (user?.role === 'admin') {
        const { data: allProjects, error: allProjectsError } = await supabase
          .from("sistema_projects")
          .select("id")

        if (allProjectsError) throw allProjectsError

        const projectIds = (allProjects as ProjectIdRow[] | null)?.map((p) => p.id) || []
        setCachedProjectIds(userId, projectIds)
        return projectIds
      }

      // 3. If Member/Standard, use existing logic (Owned + Member)
      const [{ data: owned, error: ownedError }, { data: member, error: memberError }] = await Promise.all([
        supabase
          .from("sistema_projects")
          .select("id")
          .eq("owner_id", userId),
        supabase
          .from("sistema_project_members")
          .select("project_id")
          .eq("user_id", userId),
      ])

      if (ownedError) throw ownedError
      if (memberError) throw memberError

      const ownedIds = (owned as ProjectIdRow[] | null)?.map((p) => p.id) || []
      const memberIds = (member as MemberProjectIdRow[] | null)?.map((m) => m.project_id) || []

      const projectIds = Array.from(new Set([...ownedIds, ...memberIds]))
      setCachedProjectIds(userId, projectIds)
      return projectIds
    }

    if (type === "check-tables") {
      const { error } = await supabase
        .from("sistema_users")
        .select("id")
        .limit(1)

      if (error && error.code === "42P01") {
        return NextResponse.json({ exists: false })
      }
      return NextResponse.json({ exists: true })
    }

    if (type === "user") {
      const { data, error } = await supabase
        .from("sistema_users")
        .select("*")
        .eq("id", userId)
        .single()

      if (error && error.code !== "PGRST116") {
        if (error.code === "42P01") {
          return NextResponse.json({ exists: false, user: null })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ exists: true, user: data || null })
    }

    if (type === "tasks") {
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 })
      }
      const projectIds = await getUserProjectIds(userId!, forceRefresh)

      if (projectIds.length === 0) {
        return NextResponse.json({ data: [] })
      }

      const { data, error } = await supabase
        .from("sistema_tasks")
        .select(`
          id,
          project_id,
          column_id,
          titulo,
          descripcion,
          link,
          assignee_id,
          priority,
          due_date,
          deadline,
          labels,
          orden,
          completed,
          completed_at,
          created_at,
          updated_at,
          estimated_hours,
          task_type,
          social_copy,
          project:sistema_projects(id, nombre, color, logo_url),
          assignee:sistema_users(id, nombre, avatar_url),
          column:sistema_columns(id, nombre)
        `)
        .in("project_id", projectIds)
        .order("due_date", { ascending: true, nullsFirst: false })

      if (error) {
        console.error("Error fetching tasks:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }

    if (type === "projects") {
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 })
      }
      const projectIds = await getUserProjectIds(userId!, forceRefresh)

      if (projectIds.length === 0) {
        return NextResponse.json({ data: [] })
      }

      const { data, error } = await supabase
        .from("sistema_projects")
        .select(`
          *,
          task_count:sistema_tasks(count)
        `)
        .in("id", projectIds)
        .order("orden", { ascending: true })

      if (error) {
        console.error("Error fetching projects:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }

    if (type === "project-members") {
      const projectId = searchParams.get("projectId")
      if (!projectId) {
        return NextResponse.json({ error: "Missing projectId" }, { status: 400 })
      }

      const { data, error } = await supabase
        .from("sistema_project_members")
        .select(`
          *,
          user:sistema_users(id, nombre, email, avatar_url, role)
        `)
        .eq("project_id", projectId)
        .order("created_at", { ascending: true })

      if (error) {
        console.error("Error fetching project members:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }

    if (type === "events") {
      if (!userId) {
        return NextResponse.json({ error: "Missing userId" }, { status: 400 })
      }
      const projectIds = await getUserProjectIds(userId!, forceRefresh)

      if (projectIds.length === 0) {
        return NextResponse.json({ data: [] })
      }

      const syncResult = await syncEfemeridesCalendarioActual({
        userId,
        projectIds,
        backfillOnly: true,
      })

      if (!syncResult.success) {
        console.error("Error syncing efemerides into calendar:", syncResult.error)
      }

      const { data, error } = await supabase
        .from("sistema_calendar_events")
        .select(`
          id,
          project_id,
          titulo,
          descripcion,
          tipo,
          fecha_inicio,
          fecha_fin,
          todo_el_dia,
          color,
          task_id,
          created_by,
          created_at,
          updated_at,
          project:sistema_projects(id, nombre, color, logo_url)
        `)
        .in("project_id", projectIds)
        .order("fecha_inicio", { ascending: true })

      if (error) {
        console.error("Error fetching events:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (err) {
    console.error("Sistema data error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, userId, targetUserId, newRole, email, nombre, role } = body

    if (action === "update-role") {
      const supabase = getAdminClient()

      // 1. Verify requester is admin
      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!requester || requester.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      // 2. Update target user
      const { error } = await supabase
        .from("sistema_users")
        .update({ role: newRole })
        .eq("id", targetUserId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === "create-user") {
      const supabase = getAdminClient()

      // 1. Verify requester is admin
      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!requester || requester.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      // 2. Generate invite link (creates user if not exists)
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo: `${request.headers.get('origin')}/auth/callback?next=/sistema`,
          data: {
            full_name: nombre,
          }
        }
      })

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 500 })
      }

      if (!linkData.user || !linkData.properties?.action_link) {
        return NextResponse.json({ error: "Failed to generate invite link" }, { status: 500 })
      }

      const actionLink = linkData.properties.action_link

      // 3. Send email via Resend
      if (resend) {
        const { error: emailError } = await resend.emails.send({
          from: 'Quepia <notificaciones@quepia.com>',
          to: email,
          subject: 'Te invitaron a colaborar en Quepia',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Bienvenido a Quepia</h1>
              <p>Hola ${nombre},</p>
              <p>Te han invitado a colaborar en el sistema de gestión de Quepia.</p>
              <p>Para comenzar, haz clic en el siguiente botón para configurar tu contraseña:</p>
              <a href="${actionLink}" style="display: inline-block; background-color: #7928ca; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">Aceptar Invitación</a>
              <p style="margin-top: 24px; color: #666; font-size: 14px;">Si no esperabas esta invitación, puedes ignorar este correo.</p>
            </div>
          `
        })

        if (emailError) {
          console.error("Error sending invite email:", emailError)
          // Continue anyway since user is created, but warn?
        }
      } else {
        console.warn("RESEND_API_KEY not found, email not sent")
      }

      // 4. Create/Update sistema_user profile
      const { error: profileError } = await supabase
        .from("sistema_users")
        .upsert({
          id: linkData.user.id,
          email: email,
          nombre: nombre,
          role: role || 'user',
          avatar_url: ''
        })

      if (profileError) {
        return NextResponse.json({ error: profileError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, user: linkData.user })
    }

    if (action === "delete-user") {
      const supabase = getAdminClient()

      // 1. Verify requester is admin
      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!requester || requester.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      if (userId === targetUserId) {
        return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 })
      }

      // 2. Delete from sistema_users
      const { error: profileError } = await supabase
        .from("sistema_users")
        .delete()
        .eq("id", targetUserId)

      if (profileError) {
        console.error("Error deleting profile:", profileError)
        // Continue to try deleting from auth
      }

      // 3. Delete from auth.users
      const { error: authError } = await supabase.auth.admin.deleteUser(targetUserId)

      if (authError) {
        return NextResponse.json({ error: authError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === "add-project-member") {
      const { projectId, targetUserId, memberRole } = body
      const supabase = getAdminClient()

      // Verify requester is admin or project owner
      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      const { data: project } = await supabase
        .from("sistema_projects")
        .select("owner_id")
        .eq("id", projectId)
        .single()

      if (!requester || (requester.role !== "admin" && project?.owner_id !== userId)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }

      const { error } = await supabase
        .from("sistema_project_members")
        .insert({
          project_id: projectId,
          user_id: targetUserId,
          role: memberRole || "member",
        })

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "El usuario ya es miembro del proyecto" }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === "update-project-member-role") {
      const { memberId, memberRole } = body
      const supabase = getAdminClient()

      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!requester || requester.role !== "admin") {
        // Also allow project owner
        const { data: member } = await supabase
          .from("sistema_project_members")
          .select("project_id")
          .eq("id", memberId)
          .single()

        if (member) {
          const { data: project } = await supabase
            .from("sistema_projects")
            .select("owner_id")
            .eq("id", member.project_id)
            .single()

          if (!project || project.owner_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
          }
        } else {
          return NextResponse.json({ error: "Member not found" }, { status: 404 })
        }
      }

      const { error } = await supabase
        .from("sistema_project_members")
        .update({ role: memberRole })
        .eq("id", memberId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    if (action === "remove-project-member") {
      const { memberId } = body
      const supabase = getAdminClient()

      const { data: requester } = await supabase
        .from("sistema_users")
        .select("role")
        .eq("id", userId)
        .single()

      if (!requester || requester.role !== "admin") {
        const { data: member } = await supabase
          .from("sistema_project_members")
          .select("project_id")
          .eq("id", memberId)
          .single()

        if (member) {
          const { data: project } = await supabase
            .from("sistema_projects")
            .select("owner_id")
            .eq("id", member.project_id)
            .single()

          if (!project || project.owner_id !== userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
          }
        } else {
          return NextResponse.json({ error: "Member not found" }, { status: 404 })
        }
      }

      const { error } = await supabase
        .from("sistema_project_members")
        .delete()
        .eq("id", memberId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    console.error("Sistema data error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
