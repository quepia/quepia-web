import { localDateTimeToUtcIso } from "./publishing-rules"

export function validScheduleSuggestions<T extends { scheduledFor: string; reason: string }>(items: T[], minimum: number, maximum: number): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(item.scheduledFor) || seen.has(item.scheduledFor)) return false
    try {
      const timestamp = Date.parse(localDateTimeToUtcIso(item.scheduledFor)!)
      if (!Number.isFinite(timestamp) || timestamp < minimum || timestamp > maximum) return false
      seen.add(item.scheduledFor)
      return true
    } catch { return false }
  }).slice(0, 3).map(item => ({ ...item, reason: item.reason.slice(0, 120) }))
}
