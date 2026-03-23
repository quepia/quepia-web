'use server'

import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { sendProposalEmail } from '@/lib/sistema/actions/proposals'
import { syncEfemeridesCalendarioActual } from '@/lib/sistema/actions/efemerides'
import { createProjectFromLead } from '@/lib/sistema/actions/crm'

// ─── Utilities ────────────────────────────────────────────────────────────────

function shortId(id: string) {
  return id.slice(0, 8)
}

function resolveId(raw: string): string {
  return raw.trim()
}

/** Try to find a full UUID from a prefix (first 8 chars) or return as-is. */
async function expandIdFromTable(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  prefix: string
): Promise<string | null> {
  if (prefix.length === 36) return prefix

  const { data, error } = await supabase
    .from(table)
    .select('id')
    .ilike('id', `${prefix}%`)
    .limit(1)
    .single()

  if (error || !data) return null
  return data.id
}

function prioLabel(p: string | null) {
  const map: Record<string, string> = { P1: '🔴 P1', P2: '🟠 P2', P3: '🟡 P3', P4: '⚪ P4' }
  return map[p ?? ''] ?? (p ?? 'Sin prioridad')
}

function currencyLabel(c: string | null) {
  return c ?? 'ARS'
}

function formatMoney(amount: number | null, currency: string | null) {
  const sym = currency === 'USD' ? 'U$D' : currency === 'EUR' ? '€' : '$'
  return `${sym} ${Number(amount ?? 0).toLocaleString('es-AR')}`
}

function yesNo(v: boolean | null) {
  return v ? 'Sí' : 'No'
}

// ─── /ayuda ───────────────────────────────────────────────────────────────────

export async function handleAyuda(): Promise<string> {
  return `📋 Comandos disponibles

🗂 PROYECTOS & TAREAS
/proyectos — Lista proyectos activos
/tareas <proyecto> — Tareas del proyecto (búsqueda parcial)
/tarea <id> — Detalle de tarea
/nueva-tarea <proyecto> | <titulo> — Crear tarea
/comentar <id> | <texto> — Comentar en tarea
/estado <id> | <columna> — Mover tarea a columna
/completar <id> — Marcar tarea completada
/prioridad <id> | <P1|P2|P3|P4> — Cambiar prioridad
/buscar <texto> — Buscar tareas

📦 ASSETS
/assets <task-id> — Assets de una tarea
/aprobar-asset <asset-id> — Aprobar asset
/cambios-asset <asset-id> — Pedir cambios
/assets-pendientes — Assets en revisión

📋 PROPUESTAS
/propuestas — Propuestas recientes
/propuesta <id> — Detalle de propuesta
/enviar-propuesta <id> — Enviar por email al cliente
/estado-propuesta <id> | <estado> — Cambiar estado

🧲 CRM
/leads — Leads del pipeline
/lead <id> — Detalle de lead
/lead-a-proyecto <id> — Convertir lead en proyecto

💰 CONTABILIDAD
/resumen-financiero — Resumen mes actual
/pagos-pendientes — Pagos pendientes de clientes

📅 CALENDARIO & EFEMÉRIDES
/calendario — Eventos próximas 4 semanas
/efemerides — Efemérides activas próximas 30 días
/sincronizar-efemerides — Sincronizar efemérides con calendarios

ℹ️ Los IDs pueden ser el UUID completo o los primeros 8 caracteres.`
}

// ─── /proyectos ───────────────────────────────────────────────────────────────

export async function handleProyectos(): Promise<string> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('sistema_projects')
    .select('id, nombre, color')
    .neq('icon', 'folder')
    .order('nombre', { ascending: true })

  if (error) return `❌ Error al cargar proyectos: ${error.message}`
  if (!data?.length) return '📭 No hay proyectos activos.'

  const lines = data.map((p) => `• ${p.nombre}  [${shortId(p.id)}]`)
  return `🗂 Proyectos activos (${data.length})\n\n${lines.join('\n')}`
}

// ─── /tareas ──────────────────────────────────────────────────────────────────

export async function handleTareas(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /tareas <nombre-del-proyecto>'

  const supabase = createAdminClient()

  const { data: projects, error: projError } = await supabase
    .from('sistema_projects')
    .select('id, nombre')
    .neq('icon', 'folder')
    .ilike('nombre', `%${args.trim()}%`)
    .limit(5)

  if (projError) return `❌ Error: ${projError.message}`
  if (!projects?.length) return `🔍 No encontré proyectos con "${args.trim()}"`

  const project = projects[0]

  const { data: tasks, error: taskError } = await supabase
    .from('sistema_tasks')
    .select('id, titulo, priority, completed, column:sistema_columns(nombre)')
    .eq('project_id', project.id)
    .eq('completed', false)
    .order('orden', { ascending: true })
    .limit(20)

  if (taskError) return `❌ Error: ${taskError.message}`
  if (!tasks?.length) return `✅ No hay tareas pendientes en "${project.nombre}".`

  const lines = tasks.map((t) => {
    const col = Array.isArray(t.column) ? t.column[0]?.nombre : (t.column as any)?.nombre
    return `• [${shortId(t.id)}] ${prioLabel(t.priority)} ${t.titulo}${col ? `  (${col})` : ''}`
  })

  return `🗂 Tareas en "${project.nombre}" (${tasks.length})\n\n${lines.join('\n')}`
}

// ─── /tarea ───────────────────────────────────────────────────────────────────

export async function handleTarea(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /tarea <id>'

  const supabase = createAdminClient()
  const fullId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(args))
  if (!fullId) return `❌ No encontré la tarea "${args.trim()}"`

  const { data: task, error } = await supabase
    .from('sistema_tasks')
    .select(`
      id, titulo, descripcion, priority, due_date, completed,
      column:sistema_columns(nombre),
      project:sistema_projects(nombre),
      assignee:sistema_users(nombre)
    `)
    .eq('id', fullId)
    .single()

  if (error || !task) return `❌ Tarea no encontrada.`

  const { data: subtasks } = await supabase
    .from('sistema_subtasks')
    .select('titulo, completed')
    .eq('task_id', fullId)
    .order('orden', { ascending: true })

  const col = Array.isArray(task.column) ? task.column[0]?.nombre : (task.column as any)?.nombre
  const proj = Array.isArray(task.project) ? task.project[0]?.nombre : (task.project as any)?.nombre
  const assignee = Array.isArray(task.assignee) ? task.assignee[0]?.nombre : (task.assignee as any)?.nombre

  const lines = [
    `📌 ${task.titulo}`,
    `Proyecto: ${proj ?? '-'}`,
    `Columna: ${col ?? '-'}`,
    `Prioridad: ${prioLabel(task.priority)}`,
    `Completada: ${yesNo(task.completed)}`,
    task.due_date ? `Vencimiento: ${task.due_date}` : null,
    assignee ? `Asignada a: ${assignee}` : null,
    task.descripcion ? `\nDescripción: ${task.descripcion}` : null,
  ].filter(Boolean)

  if (subtasks?.length) {
    lines.push('\nSubtareas:')
    subtasks.forEach((s) => lines.push(`  ${s.completed ? '✅' : '⬜'} ${s.titulo}`))
  }

  lines.push(`\nID: ${fullId}`)

  return lines.join('\n')
}

// ─── /nueva-tarea ─────────────────────────────────────────────────────────────

export async function handleNuevaTarea(args: string): Promise<string> {
  const parts = args.split('|')
  if (parts.length < 2) return '⚠️ Uso: /nueva-tarea <proyecto> | <titulo>'

  const [proyectoQ, ...rest] = parts
  const titulo = rest.join('|').trim()
  if (!proyectoQ.trim() || !titulo) return '⚠️ Faltan datos: /nueva-tarea <proyecto> | <titulo>'

  const supabase = createAdminClient()

  const { data: projects } = await supabase
    .from('sistema_projects')
    .select('id, nombre')
    .neq('icon', 'folder')
    .ilike('nombre', `%${proyectoQ.trim()}%`)
    .limit(1)

  const project = projects?.[0]
  if (!project) return `❌ No encontré proyecto con "${proyectoQ.trim()}"`

  const { data: columns } = await supabase
    .from('sistema_columns')
    .select('id, nombre')
    .eq('project_id', project.id)
    .order('orden', { ascending: true })
    .limit(1)

  const column = columns?.[0]
  if (!column) return `❌ El proyecto "${project.nombre}" no tiene columnas`

  const { data: task, error } = await supabase
    .from('sistema_tasks')
    .insert({
      project_id: project.id,
      column_id: column.id,
      titulo,
      priority: 'P4',
      orden: 0,
    })
    .select('id, titulo')
    .single()

  if (error) return `❌ Error al crear tarea: ${error.message}`

  return `✅ Tarea creada\n"${task.titulo}"\nProyecto: ${project.nombre}\nColumna: ${column.nombre}\nID: ${shortId(task.id)}`
}

// ─── /comentar ────────────────────────────────────────────────────────────────

export async function handleComentar(args: string): Promise<string> {
  const parts = args.split('|')
  if (parts.length < 2) return '⚠️ Uso: /comentar <id> | <texto>'

  const [idPart, ...rest] = parts
  const content = rest.join('|').trim()
  if (!content) return '⚠️ El comentario no puede estar vacío'

  const supabase = createAdminClient()
  const taskId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(idPart))
  if (!taskId) return `❌ No encontré la tarea "${idPart.trim()}"`

  const { error } = await supabase.from('sistema_comments').insert({
    task_id: taskId,
    user_id: null,
    author_name: 'Telegram',
    is_client: false,
    source: 'telegram_feedback',
    contenido: content,
  })

  if (error) return `❌ Error al comentar: ${error.message}`

  return `💬 Comentario agregado en tarea [${shortId(taskId)}]\n"${content}"`
}

// ─── /estado ──────────────────────────────────────────────────────────────────

export async function handleEstado(args: string): Promise<string> {
  const parts = args.split('|')
  if (parts.length < 2) return '⚠️ Uso: /estado <id> | <nombre-columna>'

  const [idPart, colPart] = parts
  const colQuery = colPart.trim()

  const supabase = createAdminClient()
  const taskId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(idPart))
  if (!taskId) return `❌ No encontré la tarea "${idPart.trim()}"`

  const { data: task } = await supabase
    .from('sistema_tasks')
    .select('project_id, titulo')
    .eq('id', taskId)
    .single()

  if (!task) return `❌ Tarea no encontrada`

  const { data: columns } = await supabase
    .from('sistema_columns')
    .select('id, nombre')
    .eq('project_id', task.project_id)
    .ilike('nombre', `%${colQuery}%`)
    .limit(1)

  const column = columns?.[0]
  if (!column) return `❌ No encontré columna con "${colQuery}" en el proyecto`

  const { error } = await supabase
    .from('sistema_tasks')
    .update({ column_id: column.id })
    .eq('id', taskId)

  if (error) return `❌ Error: ${error.message}`

  return `✅ Tarea "${task.titulo}" movida a columna "${column.nombre}"`
}

// ─── /completar ───────────────────────────────────────────────────────────────

export async function handleCompletar(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /completar <id>'

  const supabase = createAdminClient()
  const taskId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(args))
  if (!taskId) return `❌ No encontré la tarea "${args.trim()}"`

  const { data: task } = await supabase
    .from('sistema_tasks')
    .select('titulo')
    .eq('id', taskId)
    .single()

  const { error } = await supabase
    .from('sistema_tasks')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) return `❌ Error: ${error.message}`

  return `✅ Tarea "${task?.titulo ?? taskId}" marcada como completada`
}

// ─── /prioridad ───────────────────────────────────────────────────────────────

export async function handlePrioridad(args: string): Promise<string> {
  const parts = args.split('|')
  if (parts.length < 2) return '⚠️ Uso: /prioridad <id> | <P1|P2|P3|P4>'

  const [idPart, prioPart] = parts
  const prio = prioPart.trim().toUpperCase()

  if (!['P1', 'P2', 'P3', 'P4'].includes(prio)) {
    return `⚠️ Prioridad inválida. Usá P1, P2, P3 o P4.`
  }

  const supabase = createAdminClient()
  const taskId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(idPart))
  if (!taskId) return `❌ No encontré la tarea "${idPart.trim()}"`

  const { data: task } = await supabase
    .from('sistema_tasks')
    .select('titulo')
    .eq('id', taskId)
    .single()

  const { error } = await supabase
    .from('sistema_tasks')
    .update({ priority: prio })
    .eq('id', taskId)

  if (error) return `❌ Error: ${error.message}`

  return `✅ Prioridad de "${task?.titulo ?? taskId}" cambiada a ${prioLabel(prio)}`
}

// ─── /buscar ──────────────────────────────────────────────────────────────────

export async function handleBuscar(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /buscar <texto>'

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sistema_tasks')
    .select('id, titulo, priority, project:sistema_projects(nombre)')
    .eq('completed', false)
    .or(`titulo.ilike.%${args.trim()}%,descripcion.ilike.%${args.trim()}%`)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `🔍 Sin resultados para "${args.trim()}"`

  const lines = data.map((t) => {
    const proj = Array.isArray(t.project) ? t.project[0]?.nombre : (t.project as any)?.nombre
    return `• [${shortId(t.id)}] ${prioLabel(t.priority)} ${t.titulo}  (${proj ?? '-'})`
  })

  return `🔍 Resultados para "${args.trim()}" (${data.length})\n\n${lines.join('\n')}`
}

// ─── /assets ──────────────────────────────────────────────────────────────────

const ASSET_STATUS_LABEL: Record<string, string> = {
  pending_review: '🟡 Pendiente',
  approved_final: '✅ Aprobado',
  changes_requested: '🔴 Cambios pedidos',
  draft: '⬜ Borrador',
}

export async function handleAssets(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /assets <task-id>'

  const supabase = createAdminClient()
  const taskId = await expandIdFromTable(supabase, 'sistema_tasks', resolveId(args))
  if (!taskId) return `❌ No encontré la tarea "${args.trim()}"`

  const { data, error } = await supabase
    .from('sistema_assets')
    .select('id, nombre, asset_type, approval_status, access_revoked')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false })

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `📭 Sin assets en esta tarea.`

  const lines = data.map((a) => {
    const status = ASSET_STATUS_LABEL[a.approval_status ?? ''] ?? a.approval_status ?? '-'
    const revoked = a.access_revoked ? '  🚫 Revocado' : ''
    return `• [${shortId(a.id)}] ${a.nombre}  ${status}${revoked}`
  })

  return `📦 Assets en tarea [${shortId(taskId)}] (${data.length})\n\n${lines.join('\n')}`
}

// ─── /aprobar-asset ───────────────────────────────────────────────────────────

export async function handleAprobarAsset(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /aprobar-asset <asset-id>'

  const supabase = createAdminClient()
  const assetId = await expandIdFromTable(supabase, 'sistema_assets', resolveId(args))
  if (!assetId) return `❌ No encontré el asset "${args.trim()}"`

  const { data: asset } = await supabase
    .from('sistema_assets')
    .select('nombre')
    .eq('id', assetId)
    .single()

  const { error } = await supabase
    .from('sistema_assets')
    .update({ approval_status: 'approved_final' })
    .eq('id', assetId)

  if (error) return `❌ Error: ${error.message}`

  return `✅ Asset "${asset?.nombre ?? assetId}" aprobado`
}

// ─── /cambios-asset ───────────────────────────────────────────────────────────

export async function handleCambiosAsset(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /cambios-asset <asset-id>'

  const supabase = createAdminClient()
  const assetId = await expandIdFromTable(supabase, 'sistema_assets', resolveId(args))
  if (!assetId) return `❌ No encontré el asset "${args.trim()}"`

  const { data: asset } = await supabase
    .from('sistema_assets')
    .select('nombre')
    .eq('id', assetId)
    .single()

  const { error } = await supabase
    .from('sistema_assets')
    .update({ approval_status: 'changes_requested' })
    .eq('id', assetId)

  if (error) return `❌ Error: ${error.message}`

  return `🔴 Cambios solicitados para "${asset?.nombre ?? assetId}"`
}

// ─── /assets-pendientes ───────────────────────────────────────────────────────

export async function handleAssetsPendientes(): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sistema_assets')
    .select(`
      id, nombre,
      task:sistema_tasks(titulo, project:sistema_projects(nombre))
    `)
    .eq('access_revoked', false)
    .in('approval_status', ['pending_review', 'changes_requested'])
    .order('updated_at', { ascending: false })
    .limit(15)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `✅ No hay assets pendientes de revisión.`

  const lines = data.map((a) => {
    const task = Array.isArray(a.task) ? a.task[0] : (a.task as any)
    const proj = Array.isArray(task?.project) ? task.project[0]?.nombre : (task?.project as any)?.nombre
    return `• [${shortId(a.id)}] ${a.nombre}  → ${task?.titulo ?? '-'}  (${proj ?? '-'})`
  })

  return `🟡 Assets pendientes de revisión (${data.length})\n\n${lines.join('\n')}`
}

// ─── /propuestas ──────────────────────────────────────────────────────────────

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  draft: '⬜ Borrador',
  sent: '📤 Enviada',
  accepted: '✅ Aceptada',
  rejected: '❌ Rechazada',
  changes_requested: '🔄 Cambios pedidos',
}

export async function handlePropuestas(): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sistema_proposals')
    .select('id, title, status, total_amount, currency, client_name, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `📭 No hay propuestas.`

  const lines = data.map((p) => {
    const status = PROPOSAL_STATUS_LABEL[p.status ?? ''] ?? p.status ?? '-'
    return `• [${shortId(p.id)}] ${p.title}  ${status}  ${formatMoney(p.total_amount, p.currency)}  → ${p.client_name ?? '-'}`
  })

  return `📋 Propuestas recientes (${data.length})\n\n${lines.join('\n')}`
}

// ─── /propuesta ───────────────────────────────────────────────────────────────

export async function handlePropuesta(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /propuesta <id>'

  const supabase = createAdminClient()
  const proposalId = await expandIdFromTable(supabase, 'sistema_proposals', resolveId(args))
  if (!proposalId) return `❌ No encontré la propuesta "${args.trim()}"`

  const { data: p, error } = await supabase
    .from('sistema_proposals')
    .select('id, title, status, total_amount, currency, client_name, client_email, summary, sent_at, accepted_at, rejected_at, project:sistema_projects(nombre)')
    .eq('id', proposalId)
    .single()

  if (error || !p) return `❌ Propuesta no encontrada.`

  const proj = Array.isArray(p.project) ? p.project[0]?.nombre : (p.project as any)?.nombre
  const status = PROPOSAL_STATUS_LABEL[p.status ?? ''] ?? p.status ?? '-'

  const lines = [
    `📋 ${p.title}`,
    `Estado: ${status}`,
    `Cliente: ${p.client_name ?? '-'}`,
    p.client_email ? `Email: ${p.client_email}` : null,
    proj ? `Proyecto: ${proj}` : null,
    `Total: ${formatMoney(p.total_amount, p.currency)}`,
    p.summary ? `\nResumen: ${p.summary}` : null,
    p.sent_at ? `Enviada: ${new Date(p.sent_at).toLocaleDateString('es-AR')}` : null,
    p.accepted_at ? `Aceptada: ${new Date(p.accepted_at).toLocaleDateString('es-AR')}` : null,
    p.rejected_at ? `Rechazada: ${new Date(p.rejected_at).toLocaleDateString('es-AR')}` : null,
    `\nID: ${proposalId}`,
  ].filter(Boolean)

  return lines.join('\n')
}

// ─── /enviar-propuesta ────────────────────────────────────────────────────────

export async function handleEnviarPropuesta(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /enviar-propuesta <id>'

  const supabase = createAdminClient()
  const proposalId = await expandIdFromTable(supabase, 'sistema_proposals', resolveId(args))
  if (!proposalId) return `❌ No encontré la propuesta "${args.trim()}"`

  const { data: p } = await supabase
    .from('sistema_proposals')
    .select('title, client_email')
    .eq('id', proposalId)
    .single()

  if (!p?.client_email) return `❌ La propuesta no tiene email de cliente.`

  const result = await sendProposalEmail(proposalId)
  if (!result.success) return `❌ Error al enviar: ${String((result as any).error ?? 'desconocido')}`

  return `📤 Propuesta "${p.title}" enviada a ${p.client_email}`
}

// ─── /estado-propuesta ────────────────────────────────────────────────────────

export async function handleEstadoPropuesta(args: string): Promise<string> {
  const parts = args.split('|')
  if (parts.length < 2) return '⚠️ Uso: /estado-propuesta <id> | <draft|sent|accepted|rejected|changes_requested>'

  const [idPart, statusPart] = parts
  const status = statusPart.trim().toLowerCase()
  const validStatuses = ['draft', 'sent', 'accepted', 'rejected', 'changes_requested']

  if (!validStatuses.includes(status)) {
    return `⚠️ Estado inválido. Opciones: ${validStatuses.join(', ')}`
  }

  const supabase = createAdminClient()
  const proposalId = await expandIdFromTable(supabase, 'sistema_proposals', resolveId(idPart))
  if (!proposalId) return `❌ No encontré la propuesta "${idPart.trim()}"`

  const updates: Record<string, unknown> = { status }
  const now = new Date().toISOString()
  if (status === 'accepted') updates.accepted_at = now
  if (status === 'rejected') updates.rejected_at = now
  if (status === 'changes_requested') updates.changes_requested_at = now

  const { data: p } = await supabase
    .from('sistema_proposals')
    .select('title')
    .eq('id', proposalId)
    .single()

  const { error } = await supabase
    .from('sistema_proposals')
    .update(updates)
    .eq('id', proposalId)

  if (error) return `❌ Error: ${error.message}`

  const label = PROPOSAL_STATUS_LABEL[status] ?? status
  return `✅ Propuesta "${p?.title ?? proposalId}" → ${label}`
}

// ─── /leads ───────────────────────────────────────────────────────────────────

export async function handleLeads(): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('sistema_crm_leads')
    .select('id, company_name, contact_name, status, estimated_budget, currency')
    .order('created_at', { ascending: false })
    .limit(15)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `📭 No hay leads en el CRM.`

  const lines = data.map((l) => {
    const budget = l.estimated_budget ? `  ${formatMoney(l.estimated_budget, l.currency ?? null)}` : ''
    return `• [${shortId(l.id)}] ${l.company_name}${l.contact_name ? ` (${l.contact_name})` : ''}  ${l.status ?? '-'}${budget}`
  })

  return `🧲 Leads del CRM (${data.length})\n\n${lines.join('\n')}`
}

// ─── /lead ────────────────────────────────────────────────────────────────────

export async function handleLead(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /lead <id>'

  const supabase = createAdminClient()
  const leadId = await expandIdFromTable(supabase, 'sistema_crm_leads', resolveId(args))
  if (!leadId) return `❌ No encontré el lead "${args.trim()}"`

  const { data: l, error } = await supabase
    .from('sistema_crm_leads')
    .select('*')
    .eq('id', leadId)
    .single()

  if (error || !l) return `❌ Lead no encontrado.`

  const lines = [
    `🧲 ${l.company_name}`,
    `Contacto: ${l.contact_name ?? '-'}`,
    `Email: ${l.email ?? '-'}`,
    `Teléfono: ${l.phone ?? '-'}`,
    `Estado: ${l.status ?? '-'}`,
    l.estimated_budget ? `Presupuesto estimado: ${formatMoney(l.estimated_budget, l.currency ?? null)}` : null,
    `Canal: ${l.source ?? '-'}`,
    l.notes ? `\nNotas: ${l.notes}` : null,
    l.project_id ? `\nProyecto vinculado: ${shortId(l.project_id)}` : null,
    `\nID: ${leadId}`,
  ].filter(Boolean)

  return lines.join('\n')
}

// ─── /lead-a-proyecto ─────────────────────────────────────────────────────────

export async function handleLeadAProyecto(args: string): Promise<string> {
  if (!args.trim()) return '⚠️ Uso: /lead-a-proyecto <id>'

  const supabase = createAdminClient()
  const leadId = await expandIdFromTable(supabase, 'sistema_crm_leads', resolveId(args))
  if (!leadId) return `❌ No encontré el lead "${args.trim()}"`

  const { data: lead } = await supabase
    .from('sistema_crm_leads')
    .select('company_name, project_id')
    .eq('id', leadId)
    .single()

  if (!lead) return `❌ Lead no encontrado.`
  if (lead.project_id) return `⚠️ Este lead ya tiene un proyecto vinculado (${shortId(lead.project_id)})`

  // Use first admin user as owner
  const { data: admin } = await supabase
    .from('sistema_users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single()

  if (!admin) return `❌ No encontré un usuario administrador para asignar el proyecto.`

  const result = await createProjectFromLead(leadId, admin.id)
  if (!result.success) return `❌ Error: ${String((result as any).error ?? 'desconocido')}`

  return `✅ Proyecto creado desde lead "${lead.company_name}"\nID proyecto: ${shortId(result.projectId ?? '')}`
}

// ─── /resumen-financiero ──────────────────────────────────────────────────────

export async function handleResumenFinanciero(): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [paymentsResult, expensesResult] = await Promise.all([
    supabase
      .from('accounting_client_payments')
      .select('amount, currency, status')
      .eq('month', month)
      .eq('year', year),
    supabase
      .from('accounting_expenses')
      .select('amount, currency')
      .gte('date', `${year}-${String(month).padStart(2, '0')}-01`)
      .lte('date', `${year}-${String(month).padStart(2, '0')}-31`),
  ])

  const payments = paymentsResult.data ?? []
  const expenses = expensesResult.data ?? []

  const ingresosTotales = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const ingresosConfirmados = payments
    .filter((p) => p.status === 'paid')
    .reduce((s, p) => s + Number(p.amount ?? 0), 0)
  const egresosTotales = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const saldo = ingresosConfirmados - egresosTotales

  const monthName = now.toLocaleString('es-AR', { month: 'long' })

  return [
    `💰 Resumen financiero — ${monthName} ${year}`,
    '',
    `Ingresos esperados: $ ${ingresosTotales.toLocaleString('es-AR')}`,
    `Ingresos confirmados: $ ${ingresosConfirmados.toLocaleString('es-AR')}`,
    `Egresos del mes: $ ${egresosTotales.toLocaleString('es-AR')}`,
    `Saldo neto: $ ${saldo.toLocaleString('es-AR')}`,
    '',
    `Pagos este mes: ${payments.length}  |  Egresos: ${expenses.length}`,
  ].join('\n')
}

// ─── /pagos-pendientes ────────────────────────────────────────────────────────

export async function handlePagosPendientes(): Promise<string> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('accounting_client_payments')
    .select('id, amount, currency, status, month, year, project:sistema_projects(nombre), notes')
    .neq('status', 'paid')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(15)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `✅ No hay pagos pendientes.`

  const lines = data.map((p) => {
    const proj = Array.isArray(p.project) ? p.project[0]?.nombre : (p.project as any)?.nombre
    return `• [${shortId(p.id)}] ${proj ?? '-'}  ${formatMoney(p.amount, p.currency)}  ${p.status}  ${p.month}/${p.year}`
  })

  return `💳 Pagos pendientes (${data.length})\n\n${lines.join('\n')}`
}

// ─── /calendario ──────────────────────────────────────────────────────────────

export async function handleCalendario(): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  const in4weeks = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000)

  const { data, error } = await supabase
    .from('sistema_calendar_events')
    .select('id, titulo, fecha_inicio, todo_el_dia, project:sistema_projects(nombre)')
    .gte('fecha_inicio', now.toISOString())
    .lte('fecha_inicio', in4weeks.toISOString())
    .order('fecha_inicio', { ascending: true })
    .limit(20)

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `📭 Sin eventos en las próximas 4 semanas.`

  const lines = data.map((e) => {
    const proj = Array.isArray(e.project) ? e.project[0]?.nombre : (e.project as any)?.nombre
    const fecha = new Date(e.fecha_inicio).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    return `• ${fecha}  ${e.titulo}  (${proj ?? '-'})`
  })

  return `📅 Eventos próximas 4 semanas (${data.length})\n\n${lines.join('\n')}`
}

// ─── /efemerides ──────────────────────────────────────────────────────────────

export async function handleEfemerides(): Promise<string> {
  const supabase = createAdminClient()
  const now = new Date()
  const currentYear = now.getFullYear()

  const { data, error } = await supabase
    .from('sistema_efemerides')
    .select('id, nombre, fecha_mes, fecha_dia, categoria, activa, global')
    .eq('activa', true)
    .order('fecha_mes', { ascending: true })
    .order('fecha_dia', { ascending: true })

  if (error) return `❌ Error: ${error.message}`
  if (!data?.length) return `📭 No hay efemérides activas.`

  const upcoming = data.filter((e) => {
    const date = new Date(currentYear, e.fecha_mes - 1, e.fecha_dia)
    const diffMs = date.getTime() - now.getTime()
    const days = diffMs / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 30
  })

  if (!upcoming.length) return `📭 Sin efemérides en los próximos 30 días.`

  const lines = upcoming.map((e) => {
    const date = `${String(e.fecha_dia).padStart(2, '0')}/${String(e.fecha_mes).padStart(2, '0')}`
    const global = e.global ? '  🌐' : ''
    return `• ${date}  ${e.nombre}  [${e.categoria}]${global}`
  })

  return `🗓 Efemérides próximas 30 días (${upcoming.length})\n\n${lines.join('\n')}`
}

// ─── /sincronizar-efemerides ──────────────────────────────────────────────────

export async function handleSincronizarEfemerides(): Promise<string> {
  const { data: admins } = await createAdminClient()
    .from('sistema_users')
    .select('id')
    .eq('role', 'admin')
    .limit(1)

  const adminId = admins?.[0]?.id

  const result = await syncEfemeridesCalendarioActual({
    userId: adminId,
    revalidate: false,
  })

  if (!result.success) return `❌ Error al sincronizar: ${result.error ?? 'desconocido'}`

  return `✅ Efemérides sincronizadas con el calendario del año en curso.`
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function dispatchTelegramCommand(text: string): Promise<string> {
  // text is the raw message, e.g. "/tareas Quepia" or "/nueva-tarea Quepia | Mi tarea"
  const spaceIdx = text.indexOf(' ')
  const rawCmd = spaceIdx === -1 ? text : text.slice(0, spaceIdx)
  const args = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1).trim()

  // Normalize: strip leading '/', lowercase, allow @botname suffix
  const cmd = rawCmd.replace(/^\//, '').split('@')[0].toLowerCase()

  switch (cmd) {
    case 'ayuda':
    case 'help':
    case 'start':
      return handleAyuda()

    // Proyectos & Tareas
    case 'proyectos':
      return handleProyectos()
    case 'tareas':
      return handleTareas(args)
    case 'tarea':
      return handleTarea(args)
    case 'nueva-tarea':
    case 'nuevatarea':
      return handleNuevaTarea(args)
    case 'comentar':
      return handleComentar(args)
    case 'estado':
      return handleEstado(args)
    case 'completar':
      return handleCompletar(args)
    case 'prioridad':
      return handlePrioridad(args)
    case 'buscar':
      return handleBuscar(args)

    // Assets
    case 'assets':
      return handleAssets(args)
    case 'aprobar-asset':
    case 'aprobarasset':
      return handleAprobarAsset(args)
    case 'cambios-asset':
    case 'cambiosasset':
      return handleCambiosAsset(args)
    case 'assets-pendientes':
    case 'assetspendientes':
      return handleAssetsPendientes()

    // Propuestas
    case 'propuestas':
      return handlePropuestas()
    case 'propuesta':
      return handlePropuesta(args)
    case 'enviar-propuesta':
    case 'enviarpropuesta':
      return handleEnviarPropuesta(args)
    case 'estado-propuesta':
    case 'estadopropuesta':
      return handleEstadoPropuesta(args)

    // CRM
    case 'leads':
      return handleLeads()
    case 'lead':
      return handleLead(args)
    case 'lead-a-proyecto':
    case 'leadaproyecto':
      return handleLeadAProyecto(args)

    // Contabilidad
    case 'resumen-financiero':
    case 'resumenfinanciero':
    case 'resumen':
      return handleResumenFinanciero()
    case 'pagos-pendientes':
    case 'pagospendientes':
    case 'pagos':
      return handlePagosPendientes()

    // Calendario & Efemérides
    case 'calendario':
      return handleCalendario()
    case 'efemerides':
      return handleEfemerides()
    case 'sincronizar-efemerides':
    case 'sincronizarefemerides':
    case 'sync-efemerides':
      return handleSincronizarEfemerides()

    default:
      return `❓ Comando desconocido: /${cmd}\nEscribí /ayuda para ver los comandos disponibles.`
  }
}
