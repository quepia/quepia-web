const DEFAULT_TASK_TIME_ZONE = "America/Argentina/Cordoba"

export interface TaskDeadlineFields {
  deadline?: string | null
  due_date?: string | null
}

export function getDateKeyFromValue(value?: string | null) {
  if (!value) return null
  return value.split("T")[0] || null
}

export function getTaskDeadlineDateKey(task: TaskDeadlineFields) {
  return getDateKeyFromValue(task.deadline) || task.due_date || null
}

export function toTaskDeadlineTimestamp(dateKey?: string | null) {
  return dateKey ? `${dateKey}T12:00:00` : null
}

export function getLocalDateKey(date = new Date(), timeZone = DEFAULT_TASK_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  if (!year || !month || !day) {
    return date.toISOString().split("T")[0]
  }

  return `${year}-${month}-${day}`
}

export function compareTaskDeadlines(a: TaskDeadlineFields, b: TaskDeadlineFields) {
  return (getTaskDeadlineDateKey(a) || "").localeCompare(getTaskDeadlineDateKey(b) || "")
}

export function isTaskDeadlineOverdue(task: TaskDeadlineFields, todayKey = getLocalDateKey()) {
  const deadline = getTaskDeadlineDateKey(task)
  return Boolean(deadline && deadline < todayKey)
}
