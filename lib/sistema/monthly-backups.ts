import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import {
  ArchiveCopyError,
  archiveMonthlyVersion,
  verifyMonthlyDriveFile,
  type DriveBackupAsset,
  type ArchiveMember,
} from '@/lib/sistema/google-drive-backup'
import {
  backupMonth,
  summarizeBackups,
  type BackupEntry,
} from '@/lib/sistema/monthly-backup-summary'

type Source = DriveBackupAsset & {
  fileSize: number | null
  archiveMembers?: ArchiveMember[]
}
type Job = BackupEntry & {
  source_snapshot: Source
  attempts: number
  drive_file_id: string | null
}
const TABLE = 'sistema_monthly_backups'
const LOCK = 'sistema_monthly_backup_worker'
const PAGE = 500

export function monthlyBackupsEnabled() {
  return (
    process.env.GOOGLE_DRIVE_BACKUP_ENABLED === 'true' &&
    Boolean(process.env.GOOGLE_DRIVE_CLIENTES_FOLDER_ID)
  )
}

/** No date cutoff and no notified/access-revoked filter: retain every file version. */
export async function discoverMonthlyBackups() {
  const db = createAdminClient()
  let discovered = 0
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from('sistema_asset_versions')
      .select(
        `
      id,asset_id,version_number,file_url,storage_path,file_type,file_size,original_filename,created_at,
      asset:sistema_assets!inner(nombre,asset_type,group_id,project_id,project:sistema_projects!inner(nombre))
    `,
      )
      .order('id')
      .range(offset, offset + PAGE - 1)
    if (error) throw new Error(`No se pudo leer el historial: ${error.message}`)
    const entries = (data || []).flatMap((raw) => {
      const asset = Array.isArray(raw.asset) ? raw.asset[0] : raw.asset
      const project = Array.isArray(asset?.project)
        ? asset.project[0]
        : asset?.project
      if (!asset || !project) return []
      return [
        {
          version_id: raw.id,
          project_id: asset.project_id,
          project_name: project.nombre,
          asset_name: asset.nombre,
          source_created_at: raw.created_at,
          month_key: backupMonth(raw.created_at),
          source_snapshot: {
            assetId: raw.asset_id,
            assetVersionId: raw.id,
            assetName: asset.nombre,
            assetType: asset.asset_type,
            groupId: asset.group_id,
            versionNumber: raw.version_number,
            fileUrl: raw.file_url,
            storagePath: raw.storage_path,
            fileType: raw.file_type,
            originalFilename: raw.original_filename,
            fileSize: raw.file_size,
          } satisfies Source,
        },
      ]
    })
    if (entries.length) {
      const result = await db
        .from(TABLE)
        .upsert(entries, { onConflict: 'version_id', ignoreDuplicates: true })
      if (result.error)
        throw new Error(
          `No se pudo registrar el historial: ${result.error.message}`,
        )
      discovered += entries.length
    }
    if (!data || data.length < PAGE) break
  }
  return discovered
}

export async function getMonthlyBackupOverview() {
  const db = createAdminClient()
  const [projects, worker] = await Promise.all([
    db.from('sistema_projects').select('id,nombre').order('id'),
    db
      .from(LOCK)
      .select('expires_at,owner,last_run_at,last_error')
      .eq('id', true)
      .single(),
  ])
  if (projects.error) throw projects.error
  if (worker.error)
    throw new Error('Falta habilitar la base de backups mensuales.')
  const rows: BackupEntry[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select(
        'version_id,project_id,project_name,asset_name,source_created_at,month_key,status,drive_folder_id,backed_up_at,verified_at,error',
      )
      .order('version_id')
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    rows.push(...(data as BackupEntry[]))
    if (data.length < PAGE) break
  }
  return {
    enabled: monthlyBackupsEnabled(),
    clients: summarizeBackups(rows, projects.data || []),
    running: Boolean(
      worker.data.owner && Date.parse(worker.data.expires_at) > Date.now(),
    ),
    lastRun: worker.data.last_run_at,
    lastError: worker.data.last_error,
  }
}

/** One database lease serializes all workers (manual, scheduled and CLI). */
export async function processMonthlyBackups(
  options: { maxFiles?: number; budgetMs?: number; retryErrors?: boolean } = {},
) {
  if (!monthlyBackupsEnabled())
    throw new Error('El respaldo de Drive está desactivado.')
  const db = createAdminClient()
  const owner = randomUUID()
  const started = Date.now()
  const { data: claimed, error: lockError } = await db
    .from(LOCK)
    .update({
      owner,
      expires_at: new Date(started + 10 * 60_000).toISOString(),
      last_error: null,
    })
    .eq('id', true)
    .lt('expires_at', new Date(started).toISOString())
    .select('id')
  if (lockError) throw lockError
  if (!claimed?.length)
    return { busy: true, created: 0, failed: 0, checked: 0, continued: 0 }
  const result = {
    busy: false,
    created: 0,
    failed: 0,
    checked: 0,
    continued: 0,
  }
  let lastError: string | null = null
  const deadline = started + Math.min(options.budgetMs ?? 150_000, 150_000)
  try {
    await discoverMonthlyBackups()
    if (options.retryErrors) {
      const reset = await db
        .from(TABLE)
        .update({ next_attempt_at: new Date().toISOString() })
        .eq('status', 'error')
      if (reset.error) throw reset.error
    }
    // Recheck older copies as well; deletion in Drive becomes visible and is repaired.
    const stale = await db
      .from(TABLE)
      .select('*')
      .eq('status', 'backed_up')
      .lt('verified_at', new Date(started - 30 * 86400_000).toISOString())
      .order('verified_at')
      .limit(10)
    if (stale.error) throw stale.error
    for (const job of (stale.data || []) as Job[]) {
      if (Date.now() >= deadline) break
      try {
        await verifyMonthlyDriveFile(
          job.drive_file_id!,
          job.drive_folder_id!,
          job.source_snapshot.fileSize,
        )
        for (const member of job.source_snapshot.archiveMembers || []) {
          if (Date.now() >= deadline) return result
          await verifyMonthlyDriveFile(member.id, member.parentId, member.size)
        }
        const saved = await db
          .from(TABLE)
          .update({ verified_at: new Date().toISOString() })
          .eq('version_id', job.version_id)
        if (saved.error) throw saved.error
        result.checked++
      } catch (error) {
        const saved = await db
          .from(TABLE)
          .update({
            status: 'error',
            error: safeBackupError(error),
            next_attempt_at: new Date().toISOString(),
          })
          .eq('version_id', job.version_id)
        if (saved.error) throw saved.error
      }
    }
    for (
      let i = 0;
      i < (options.maxFiles ?? 30) && Date.now() < deadline;
      i++
    ) {
      const next = await db
        .from(TABLE)
        .select('*')
        .neq('status', 'backed_up')
        .lte('next_attempt_at', new Date().toISOString())
        .order('next_attempt_at')
        .order('source_created_at')
        .limit(1)
      if (next.error) throw next.error
      const job = next.data?.[0] as Job | undefined
      if (!job) break
      try {
        const file = await archiveMonthlyVersion({
          projectId: job.project_id,
          projectName: job.project_name,
          month: job.month_key,
          asset: job.source_snapshot,
          fileSize: job.source_snapshot.fileSize,
          previousMembers: job.source_snapshot.archiveMembers,
        })
        const now = new Date().toISOString()
        const saved = await db
          .from(TABLE)
          .update({
            status: 'backed_up',
            source_snapshot: {
              ...job.source_snapshot,
              ...(file.members ? { archiveMembers: file.members } : {}),
            },
            drive_file_id: file.fileId,
            drive_folder_id: file.folderId,
            backed_up_at: now,
            verified_at: now,
            error: null,
            attempts: job.attempts + 1,
          })
          .eq('version_id', job.version_id)
        if (saved.error) throw saved.error
        result.created++
      } catch (error) {
        const members =
          error instanceof ArchiveCopyError
            ? [
                ...new Map(
                  error.members.map((member) => [member.id, member]),
                ).values(),
              ]
            : null
        const continuing = Boolean(
          members &&
          /Carpeta parcialmente copiada/.test((error as Error).message) &&
          members.length > (job.source_snapshot.archiveMembers?.length || 0),
        )
        if (continuing) result.continued++
        else result.failed++
        const saved = await db
          .from(TABLE)
          .update({
            status: continuing ? 'pending' : 'error',
            ...(members
              ? {
                  source_snapshot: {
                    ...job.source_snapshot,
                    archiveMembers: members,
                  },
                }
              : {}),
            error: continuing ? null : safeBackupError(error),
            attempts: continuing ? job.attempts : job.attempts + 1,
            next_attempt_at: new Date(
              Date.now() +
                (continuing
                  ? 0
                  : Math.min(
                      86400_000,
                      60_000 * 2 ** Math.min(job.attempts + 1, 11),
                    )),
            ).toISOString(),
          })
          .eq('version_id', job.version_id)
        if (saved.error) throw saved.error
      }
    }
    return result
  } catch (error) {
    lastError = safeBackupError(error)
    throw error
  } finally {
    const released = await db
      .from(LOCK)
      .update({
        owner: null,
        expires_at: new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        last_error: lastError,
      })
      .eq('id', true)
      .eq('owner', owner)
    if (released.error)
      console.error(
        '[MonthlyBackups] Could not release lease:',
        released.error.message,
      )
  }
}

function safeBackupError(error: unknown) {
  const message =
    error instanceof Error ? error.message : 'No se pudo respaldar el archivo.'
  if (/File not found/i.test(message))
    return 'El original no está disponible para la cuenta de respaldo. Revisá el enlace y los permisos en Drive.'
  return message.replace(/https?:\/\/\S+/g, '[enlace omitido]').slice(0, 500)
}
