import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/sistema/supabase/admin"
import { sendEmail } from "@/lib/sistema/email-service"
import { getLocalDateKey, getTaskDeadlineDateKey } from "@/lib/sistema/task-deadlines"

export const dynamic = "force-dynamic"

const DEFAULT_TIME_ZONE = "America/Argentina/Cordoba"
const MAX_HIGHLIGHTS = 10

type TaskDigestRow = {
  id: string
  titulo: string
  priority: string | null
  deadline: string | null
  due_date: string | null
  assignee_id: string | null
  project?: {
    id: string
    nombre: string | null
    color?: string | null
  } | null
  assignee?: {
    id: string
    nombre: string | null
    email: string | null
    is_active?: boolean | null
    deleted_at?: string | null
  } | null
}

type PreferenceRow = {
  user_id: string
  email_enabled: boolean | null
  in_app_enabled: boolean | null
}

type MaybeArray<T> = T | T[] | null | undefined
type TaskDigestRawRow = Omit<TaskDigestRow, "project" | "assignee"> & {
  project?: MaybeArray<TaskDigestRow["project"]>
  assignee?: MaybeArray<TaskDigestRow["assignee"]>
}

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://quepia.com"
}

function firstRelation<T>(value: MaybeArray<T>) {
  return Array.isArray(value) ? value[0] || null : value || null
}

function formatDigestDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

function formatTaskTime(dateKey: string, todayKey: string) {
  if (dateKey === todayKey) return "Hoy"
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
  })
}

function groupTasksByAssignee(tasks: TaskDigestRow[]) {
  const groups = new Map<string, TaskDigestRow[]>()

  for (const task of tasks) {
    if (!task.assignee_id) continue
    const current = groups.get(task.assignee_id) || []
    current.push(task)
    groups.set(task.assignee_id, current)
  }

  return groups
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured" },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const timeZone = process.env.TASK_NOTIFICATIONS_TIME_ZONE || DEFAULT_TIME_ZONE
    const todayKey = getLocalDateKey(new Date(), timeZone)
    const actionPath = "/sistema?view=today"
    const actionUrl = `${getBaseUrl()}${actionPath}`
    const supabase = createAdminClient()

    const { data: rawTasks, error: tasksError } = await supabase
      .from("sistema_tasks")
      .select(`
        id,
        titulo,
        priority,
        deadline,
        due_date,
        assignee_id,
        project:sistema_projects(id, nombre, color),
        assignee:sistema_users(id, nombre, email, is_active, deleted_at)
      `)
      .eq("completed", false)
      .not("assignee_id", "is", null)
      .or("deadline.not.is.null,due_date.not.is.null")
      .order("deadline", { ascending: true, nullsFirst: false })

    if (tasksError) {
      console.error("[OverdueDigest] Error fetching tasks:", tasksError)
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 })
    }

    const dueTasks = ((rawTasks || []) as unknown as TaskDigestRawRow[])
      .map((task) => ({
        ...task,
        project: firstRelation(task.project),
        assignee: firstRelation(task.assignee),
      }))
      .filter((task) => {
        const user = task.assignee
        if (!user?.email) return false
        if (user.deleted_at) return false
        if (user.is_active === false) return false

        const deadlineDate = getTaskDeadlineDateKey(task)
        return Boolean(deadlineDate && deadlineDate <= todayKey)
      })
      .sort((a, b) => (getTaskDeadlineDateKey(a) || "").localeCompare(getTaskDeadlineDateKey(b) || ""))

    const groups = groupTasksByAssignee(dueTasks)
    const userIds = Array.from(groups.keys())

    if (userIds.length === 0) {
      return NextResponse.json({
        success: true,
        date: todayKey,
        sent: 0,
        skipped: 0,
        failed: 0,
      })
    }

    const [{ data: prefs }, { data: sentRuns }] = await Promise.all([
      supabase
        .from("sistema_notification_preferences")
        .select("user_id, email_enabled, in_app_enabled")
        .in("user_id", userIds),
      supabase
        .from("sistema_task_deadline_notification_runs")
        .select("user_id")
        .eq("notification_type", "overdue_daily")
        .eq("notification_date", todayKey)
        .in("user_id", userIds),
    ])

    const prefsByUser = new Map((prefs as PreferenceRow[] | null || []).map((pref) => [pref.user_id, pref]))
    const alreadySent = new Set((sentRuns || []).map((run) => run.user_id as string))

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const [userId, userTasks] of groups) {
      const firstTask = userTasks[0]
      const user = firstTask.assignee
      const pref = prefsByUser.get(userId)
      const emailEnabled = pref?.email_enabled ?? true
      const inAppEnabled = pref?.in_app_enabled ?? true
      const overdueTasks = userTasks.filter((task) => {
        const deadlineDate = getTaskDeadlineDateKey(task)
        return Boolean(deadlineDate && deadlineDate < todayKey)
      })
      const todayTasks = userTasks.filter((task) => getTaskDeadlineDateKey(task) === todayKey)

      if (!user?.email || overdueTasks.length === 0 || !emailEnabled || alreadySent.has(userId)) {
        skipped += 1
        continue
      }

      const highlights = [...overdueTasks, ...todayTasks].slice(0, MAX_HIGHLIGHTS).map((task) => {
        const deadlineDate = getTaskDeadlineDateKey(task) || todayKey
        return {
          title: task.titulo,
          project: task.project?.nombre || "Sin proyecto",
          type: "deadline" as const,
          url: `${getBaseUrl()}/sistema?taskId=${task.id}`,
          time: formatTaskTime(deadlineDate, todayKey),
        }
      })

      const emailResult = await sendEmail({
        type: "daily_digest",
        to: user.email,
        data: {
          userName: user.nombre || "Usuario",
          date: formatDigestDate(todayKey),
          overdueCount: overdueTasks.length,
          upcomingCount: todayTasks.length,
          highlights,
          actionUrl,
        },
      })

      if (!emailResult.success) {
        failed += 1
        console.error("[OverdueDigest] Email failed:", {
          userId,
          email: user.email,
          error: emailResult.error,
        })
        continue
      }

      const overdueTitle = `Tenés ${overdueTasks.length} tarea${overdueTasks.length === 1 ? "" : "s"} vencida${overdueTasks.length === 1 ? "" : "s"}`

      if (inAppEnabled) {
        await supabase.from("sistema_notifications").insert({
          user_id: userId,
          type: "system",
          title: overdueTitle,
          content: "Revisá la vista Hoy para reorganizarlas y marcarlas como completadas.",
          link: actionPath,
          data: {
            notificationType: "overdue_daily",
            date: todayKey,
            overdueTaskIds: overdueTasks.map((task) => task.id),
            dueTodayTaskIds: todayTasks.map((task) => task.id),
          },
        })
      }

      const { error: runError } = await supabase
        .from("sistema_task_deadline_notification_runs")
        .insert({
          user_id: userId,
          notification_type: "overdue_daily",
          notification_date: todayKey,
          overdue_task_ids: overdueTasks.map((task) => task.id),
          due_today_task_ids: todayTasks.map((task) => task.id),
          email_id: "id" in emailResult ? emailResult.id || null : null,
        })

      if (runError) {
        console.error("[OverdueDigest] Error recording run:", runError)
      }

      sent += 1
    }

    return NextResponse.json({
      success: true,
      date: todayKey,
      sent,
      skipped,
      failed,
    }, { status: failed > 0 ? 207 : 200 })
  } catch (error) {
    console.error("[OverdueDigest] Unexpected error:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    )
  }
}
