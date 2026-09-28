export const BACKUP_TIME_ZONE = 'America/Argentina/Cordoba'

export function backupMonth(date: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BACKUP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date(date))
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`
}

export type BackupEntry = {
  version_id: string
  project_id: string
  project_name: string
  asset_name: string
  source_created_at: string
  month_key: string
  status: 'pending' | 'backed_up' | 'error'
  drive_folder_id: string | null
  backed_up_at: string | null
  verified_at: string | null
  error: string | null
}

export function summarizeBackups(
  entries: BackupEntry[],
  projects: { id: string; nombre: string }[],
  now = new Date(),
) {
  const currentMonth = backupMonth(now.toISOString())
  const clients = new Map(
    projects.map((p) => [
      p.id,
      { id: p.id, name: p.nombre, months: [] as BackupMonth[] },
    ]),
  )
  for (const entry of entries) {
    let client = clients.get(entry.project_id)
    if (!client) {
      client = { id: entry.project_id, name: entry.project_name, months: [] }
      clients.set(entry.project_id, client)
    }
    let month = client.months.find((m) => m.key === entry.month_key)
    if (!month) {
      month = {
        key: entry.month_key,
        total: 0,
        backedUp: 0,
        pending: 0,
        failed: 0,
        folders: [],
        errors: [],
        lastBackup: null,
        lastVerified: null,
        open: entry.month_key >= currentMonth,
      }
      client.months.push(month)
    }
    month.total++
    if (entry.status === 'backed_up') month.backedUp++
    else if (entry.status === 'error') month.failed++
    else month.pending++
    if (entry.drive_folder_id && !month.folders.includes(entry.drive_folder_id))
      month.folders.push(entry.drive_folder_id)
    if (entry.error)
      month.errors.push({
        id: entry.version_id,
        name: entry.asset_name,
        message: entry.error,
      })
    if (
      entry.backed_up_at &&
      (!month.lastBackup || entry.backed_up_at > month.lastBackup)
    )
      month.lastBackup = entry.backed_up_at
    // Oldest verification is the honest lower bound for this month's successful copies.
    if (
      entry.status === 'backed_up' &&
      entry.verified_at &&
      (!month.lastVerified || entry.verified_at < month.lastVerified)
    )
      month.lastVerified = entry.verified_at
  }
  return [...clients.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((c) => ({
      ...c,
      months: c.months.sort((a, b) => b.key.localeCompare(a.key)),
    }))
}

export type BackupMonth = {
  key: string
  total: number
  backedUp: number
  pending: number
  failed: number
  folders: string[]
  errors: { id: string; name: string; message: string }[]
  lastBackup: string | null
  lastVerified: string | null
  open: boolean
}
export type BackupClient = ReturnType<typeof summarizeBackups>[number]
