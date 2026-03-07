'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/sistema/email-service'
import type { EfemerideInsert, EfemerideUpdate } from '@/types/sistema'

type AdminClient = ReturnType<typeof createAdminClient>

interface SubirAssetParams {
  efemeride_id: string
  project_id: string
  anio: number
  asset_url: string
  asset_storage_path?: string
  thumbnail_url?: string
  notas?: string
}

interface EfemerideRow {
  id: string
  nombre: string
  descripcion: string | null
  fecha_mes: number
  fecha_dia: number
  categoria: string
  dias_anticipacion: number
  recurrente: boolean
  activa: boolean
  global: boolean
  project_id: string | null
  created_by: string | null
}

interface EfemerideProjectRow {
  id: string
  nombre: string
  color: string | null
}

interface EfemerideAsignacionRow {
  id: string
  project_id: string
  calendar_event_id: string | null
}

function buildEfemerideDateBounds(anio: number, mes: number, dia: number) {
  const start = new Date(Date.UTC(anio, mes - 1, dia, 0, 0, 0))
  const end = new Date(Date.UTC(anio, mes - 1, dia + 1, 0, 0, 0))

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

function buildEfemerideDateISO(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0)).toISOString()
}

function buildCalendarEventPayload(
  efemeride: EfemerideRow,
  project: EfemerideProjectRow,
  anio: number
) {
  return {
    project_id: project.id,
    titulo: efemeride.nombre,
    descripcion: efemeride.descripcion || `Efeméride: ${efemeride.nombre}`,
    tipo: 'publicacion' as const,
    fecha_inicio: buildEfemerideDateISO(anio, efemeride.fecha_mes, efemeride.fecha_dia),
    fecha_fin: null,
    todo_el_dia: true,
    color: project.color || '#22c55e',
  }
}

async function requireAdminAccess() {
  const admin = createAdminClient()
  const supabase = await createClient()

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    throw new Error('No estás autenticado.')
  }

  const userId = authData.user.id
  const { data: sistemaUser, error: sistemaUserError } = await admin
    .from('sistema_users')
    .select('role')
    .eq('id', userId)
    .single()

  if (sistemaUserError) {
    throw new Error(`No se pudo validar el permiso del usuario: ${sistemaUserError.message}`)
  }

  if (!sistemaUser || sistemaUser.role !== 'admin') {
    throw new Error('No tienes permisos para gestionar efemérides.')
  }

  return { admin, userId }
}

async function getTargetProjects(admin: AdminClient, efemeride: EfemerideRow) {
  let query = admin
    .from('sistema_projects')
    .select('id, nombre, color')

  if (efemeride.global || !efemeride.project_id) {
    query = query.neq('icon', 'folder')
  } else {
    query = query.eq('id', efemeride.project_id)
  }

  const { data: projects, error } = await query.order('nombre', { ascending: true })

  if (error) {
    throw new Error(`No se pudieron cargar los proyectos para sincronizar: ${error.message}`)
  }

  return (projects || []) as EfemerideProjectRow[]
}

async function deleteCalendarEventsByIds(admin: AdminClient, eventIds: Array<string | null | undefined>) {
  const ids = Array.from(new Set(eventIds.filter((id): id is string => Boolean(id))))
  if (ids.length === 0) return

  const { error } = await admin
    .from('sistema_calendar_events')
    .delete()
    .in('id', ids)

  if (error) {
    throw new Error(`No se pudieron eliminar eventos vinculados: ${error.message}`)
  }
}

async function findExistingEfemerideEvent(
  admin: AdminClient,
  projectId: string,
  titles: string[],
  anio: number,
  mes: number,
  dia: number
) {
  const uniqueTitles = Array.from(new Set(titles.filter(Boolean)))
  if (uniqueTitles.length === 0) return null

  const { start, end } = buildEfemerideDateBounds(anio, mes, dia)
  const { data: existingEvent, error } = await admin
    .from('sistema_calendar_events')
    .select('id')
    .eq('project_id', projectId)
    .in('titulo', uniqueTitles)
    .gte('fecha_inicio', start)
    .lt('fecha_inicio', end)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error searching existing efemeride event:', error)
    return null
  }

  return existingEvent?.id ?? null
}

async function syncEfemerideCalendarForYear(
  admin: AdminClient,
  efemeride: EfemerideRow,
  anio: number,
  userId: string
) {
  const { data: existingAsignaciones, error: asignacionesError } = await admin
    .from('sistema_efemerides_proyectos')
    .select('id, project_id, calendar_event_id')
    .eq('efemeride_id', efemeride.id)
    .eq('anio', anio)

  if (asignacionesError) {
    throw new Error(`No se pudieron leer las asignaciones de la efeméride: ${asignacionesError.message}`)
  }

  const asignaciones = (existingAsignaciones || []) as EfemerideAsignacionRow[]
  const asignacionByProject = new Map(asignaciones.map((item) => [item.project_id, item]))
  const targetProjects = efemeride.activa ? await getTargetProjects(admin, efemeride) : []
  const targetProjectIds = new Set(targetProjects.map((project) => project.id))

  const asignacionesFueraDeScope = asignaciones.filter(
    (item) => item.calendar_event_id && !targetProjectIds.has(item.project_id)
  )

  if (asignacionesFueraDeScope.length > 0) {
    await deleteCalendarEventsByIds(
      admin,
      asignacionesFueraDeScope.map((item) => item.calendar_event_id)
    )

    const { error: clearError } = await admin
      .from('sistema_efemerides_proyectos')
      .update({ calendar_event_id: null })
      .in('id', asignacionesFueraDeScope.map((item) => item.id))

    if (clearError) {
      throw new Error(`No se pudieron limpiar vínculos fuera de alcance: ${clearError.message}`)
    }
  }

  for (const project of targetProjects) {
    const baseEventPayload = buildCalendarEventPayload(efemeride, project, anio)
    const existingAsignacion = asignacionByProject.get(project.id)
    let calendarEventId = existingAsignacion?.calendar_event_id ?? null

    if (calendarEventId) {
      const { data: updatedEvent, error: updateEventError } = await admin
        .from('sistema_calendar_events')
        .update(baseEventPayload)
        .eq('id', calendarEventId)
        .select('id')
        .maybeSingle()

      if (updateEventError) {
        console.error('Error updating synced efemeride event:', updateEventError)
        calendarEventId = null
      } else {
        calendarEventId = updatedEvent?.id ?? null
      }
    }

    if (!calendarEventId) {
      calendarEventId = await findExistingEfemerideEvent(
        admin,
        project.id,
        [efemeride.nombre, `Efeméride: ${efemeride.nombre}`],
        anio,
        efemeride.fecha_mes,
        efemeride.fecha_dia
      )
    }

    if (calendarEventId && !existingAsignacion?.calendar_event_id) {
      const { data: matchedEvent, error: matchedEventError } = await admin
        .from('sistema_calendar_events')
        .update(baseEventPayload)
        .eq('id', calendarEventId)
        .select('id')
        .single()

      if (matchedEventError) {
        console.error('Error reusing existing efemeride event:', matchedEventError)
        calendarEventId = null
      } else {
        calendarEventId = matchedEvent.id
      }
    }

    if (!calendarEventId) {
      const { data: createdEvent, error: createEventError } = await admin
        .from('sistema_calendar_events')
        .insert({
          ...baseEventPayload,
          created_by: userId,
        })
        .select('id')
        .single()

      if (createEventError) {
        throw new Error(`No se pudo crear el evento sincronizado: ${createEventError.message}`)
      }

      calendarEventId = createdEvent.id
    }

    if (existingAsignacion) {
      if (existingAsignacion.calendar_event_id !== calendarEventId) {
        const { error: updateAsignacionError } = await admin
          .from('sistema_efemerides_proyectos')
          .update({ calendar_event_id: calendarEventId })
          .eq('id', existingAsignacion.id)

        if (updateAsignacionError) {
          throw new Error(`No se pudo actualizar la asignación sincronizada: ${updateAsignacionError.message}`)
        }
      }

      continue
    }

    const { error: createAsignacionError } = await admin
      .from('sistema_efemerides_proyectos')
      .insert({
        efemeride_id: efemeride.id,
        project_id: project.id,
        anio,
        estado: 'pendiente',
        calendar_event_id: calendarEventId,
      })

    if (createAsignacionError) {
      throw new Error(`No se pudo crear la asignación sincronizada: ${createAsignacionError.message}`)
    }
  }
}

export async function createEfemerideSincronizada(payload: EfemerideInsert) {
  try {
    const { admin, userId } = await requireAdminAccess()

    const { data: efemeride, error } = await admin
      .from('sistema_efemerides')
      .insert({
        ...payload,
        created_by: payload.created_by || userId,
      })
      .select('*')
      .single()

    if (error || !efemeride) {
      throw new Error(error?.message || 'No se pudo crear la efeméride.')
    }

    await syncEfemerideCalendarForYear(
      admin,
      efemeride as EfemerideRow,
      new Date().getFullYear(),
      userId
    )

    revalidatePath('/sistema')
    return { success: true, efemeride }
  } catch (err) {
    console.error('Error in createEfemerideSincronizada:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error creando la efeméride',
    }
  }
}

export async function updateEfemerideSincronizada(id: string, updates: EfemerideUpdate) {
  try {
    const { admin, userId } = await requireAdminAccess()

    const { data: efemeride, error } = await admin
      .from('sistema_efemerides')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()

    if (error || !efemeride) {
      throw new Error(error?.message || 'No se pudo actualizar la efeméride.')
    }

    await syncEfemerideCalendarForYear(
      admin,
      efemeride as EfemerideRow,
      new Date().getFullYear(),
      userId
    )

    revalidatePath('/sistema')
    return { success: true, efemeride }
  } catch (err) {
    console.error('Error in updateEfemerideSincronizada:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error actualizando la efeméride',
    }
  }
}

export async function deleteEfemerideSincronizada(id: string) {
  try {
    const { admin } = await requireAdminAccess()

    const { data: asignaciones, error: asignacionesError } = await admin
      .from('sistema_efemerides_proyectos')
      .select('calendar_event_id')
      .eq('efemeride_id', id)

    if (asignacionesError) {
      throw new Error(`No se pudieron leer los vínculos del calendario: ${asignacionesError.message}`)
    }

    await deleteCalendarEventsByIds(
      admin,
      (asignaciones || []).map((item) => item.calendar_event_id)
    )

    const { error: deleteError } = await admin
      .from('sistema_efemerides')
      .delete()
      .eq('id', id)

    if (deleteError) {
      throw new Error(deleteError.message)
    }

    revalidatePath('/sistema')
    return { success: true }
  } catch (err) {
    console.error('Error in deleteEfemerideSincronizada:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error eliminando la efeméride',
    }
  }
}

export async function subirAssetEfemeride(params: SubirAssetParams) {
  const admin = createAdminClient()
  const supabase = await createClient()

  try {
    // Auth check
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      throw new Error('No estás autenticado.')
    }
    const userId = authData.user.id

    // Get efemeride info
    const { data: efemeride, error: efError } = await admin
      .from('sistema_efemerides')
      .select('*')
      .eq('id', params.efemeride_id)
      .single()

    if (efError || !efemeride) {
      throw new Error('Efeméride no encontrada.')
    }

    // Get project info
    const { data: project, error: projError } = await admin
      .from('sistema_projects')
      .select('id, nombre, color')
      .eq('id', params.project_id)
      .single()

    if (projError || !project) {
      throw new Error('Proyecto no encontrado.')
    }

    // 1. Upsert efemerides_proyectos record
    const { data: asignacion, error: upsertError } = await admin
      .from('sistema_efemerides_proyectos')
      .upsert({
        efemeride_id: params.efemeride_id,
        project_id: params.project_id,
        anio: params.anio,
        estado: 'lista',
        asset_url: params.asset_url,
        asset_storage_path: params.asset_storage_path || null,
        thumbnail_url: params.thumbnail_url || null,
        notas: params.notas || null,
        uploaded_by: userId,
      }, {
        onConflict: 'efemeride_id,project_id,anio',
      })
      .select()
      .single()

    if (upsertError) {
      throw new Error(`Error guardando asignación: ${upsertError.message}`)
    }

    // 2. Reuse synced calendar event when it already exists
    const eventDateStr = buildEfemerideDateISO(params.anio, efemeride.fecha_mes, efemeride.fecha_dia)
    const baseEventPayload = buildCalendarEventPayload(
      efemeride as EfemerideRow,
      project as EfemerideProjectRow,
      params.anio
    )

    let calendarEvent: { id: string } | null = null
    let linkedCalendarEventId = asignacion.calendar_event_id

    if (linkedCalendarEventId) {
      const { data: updatedEvent, error: updateEventError } = await admin
        .from('sistema_calendar_events')
        .update(baseEventPayload)
        .eq('id', linkedCalendarEventId)
        .select('id')
        .maybeSingle()

      if (updateEventError) {
        console.error('Error updating linked calendar event:', updateEventError)
        linkedCalendarEventId = null
      } else if (updatedEvent) {
        calendarEvent = updatedEvent
      } else {
        linkedCalendarEventId = null
      }
    }

    if (!linkedCalendarEventId) {
      linkedCalendarEventId = await findExistingEfemerideEvent(
        admin,
        params.project_id,
        [efemeride.nombre, `Efeméride: ${efemeride.nombre}`],
        params.anio,
        efemeride.fecha_mes,
        efemeride.fecha_dia
      )
    }

    if (linkedCalendarEventId && !asignacion.calendar_event_id) {
      const { data: matchedEvent, error: matchedEventError } = await admin
        .from('sistema_calendar_events')
        .update(baseEventPayload)
        .eq('id', linkedCalendarEventId)
        .select('id')
        .single()

      if (matchedEventError) {
        console.error('Error reusing existing calendar event:', matchedEventError)
        linkedCalendarEventId = null
      } else {
        calendarEvent = matchedEvent
      }
    }

    if (!linkedCalendarEventId) {
      const { data: createdEvent, error: eventError } = await admin
        .from('sistema_calendar_events')
        .insert({
          ...baseEventPayload,
          created_by: userId,
        })
        .select('id')
        .single()

      if (eventError) {
        console.error('Error creating calendar event:', eventError)
      } else {
        calendarEvent = createdEvent
        linkedCalendarEventId = createdEvent.id
      }
    }

    // 3. Find "LISTO PARA PUBLICAR" column
    const { data: columns } = await admin
      .from('sistema_columns')
      .select('id, nombre')
      .eq('project_id', params.project_id)
      .order('orden', { ascending: true })

    const targetColumn = columns?.find(
      (c) => c.nombre.toUpperCase().includes('LISTO') || c.nombre.toUpperCase().includes('PUBLICAR')
    ) || columns?.[columns.length - 1]

    let taskData = null
    if (targetColumn) {
      // 4. Create task
      const { data: task, error: taskError } = await admin
        .from('sistema_tasks')
        .insert({
          project_id: params.project_id,
          column_id: targetColumn.id,
          titulo: `Efeméride: ${efemeride.nombre}`,
          descripcion: `Asset para ${efemeride.nombre} (${efemeride.fecha_dia}/${efemeride.fecha_mes}/${params.anio}).\n${params.notas || ''}`,
          priority: 'P2',
          due_date: eventDateStr,
          labels: ['efemeride'],
          orden: 0,
        })
        .select()
        .single()

      if (taskError) {
        console.error('Error creating task:', taskError)
      } else {
        taskData = task
      }

      // 5. Create asset + asset version linked to the task
      if (taskData) {
        const { data: asset } = await admin
          .from('sistema_assets')
          .insert({
            task_id: taskData.id,
            project_id: params.project_id,
            nombre: `${efemeride.nombre} - ${params.anio}`,
            asset_type: 'single',
            created_by: userId,
          })
          .select()
          .single()

        if (asset) {
          await admin
            .from('sistema_asset_versions')
            .insert({
              asset_id: asset.id,
              version_number: 1,
              file_url: params.asset_url,
              storage_path: params.asset_storage_path || null,
              thumbnail_url: params.thumbnail_url || null,
              uploaded_by: userId,
            })
        }
      }
    }

    // 6. Update asignacion with calendar_event_id and task_id
    const updatePayload: Record<string, string | null> = {}
    if (linkedCalendarEventId) updatePayload.calendar_event_id = linkedCalendarEventId
    if (taskData) updatePayload.task_id = taskData.id

    if (Object.keys(updatePayload).length > 0) {
      await admin
        .from('sistema_efemerides_proyectos')
        .update(updatePayload)
        .eq('id', asignacion.id)
    }

    revalidatePath('/sistema')
    return { success: true, asignacion, calendarEvent, task: taskData }
  } catch (err) {
    console.error('Error in subirAssetEfemeride:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error subiendo asset de efeméride',
    }
  }
}

export async function checkEfemeridesNotificaciones() {
  const admin = createAdminClient()

  try {
    const now = new Date()
    const currentYear = now.getFullYear()

    // Get all active efemerides
    const { data: efemerides, error: efError } = await admin
      .from('sistema_efemerides')
      .select('*')
      .eq('activa', true)

    if (efError) throw efError
    if (!efemerides || efemerides.length === 0) {
      return { success: true, notified: 0 }
    }

    // Get existing notifications for this year
    const { data: existingLogs } = await admin
      .from('sistema_efemerides_notificaciones_log')
      .select('efemeride_id, tipo')
      .eq('anio', currentYear)

    const notifiedSet = new Set(
      (existingLogs || []).map((l) => `${l.efemeride_id}:${l.tipo}`)
    )

    // Get all projects (for checking which ones are pending)
    const { data: allProjects } = await admin
      .from('sistema_projects')
      .select('id, nombre')
      .neq('icon', 'folder')

    // Get all existing efemerides_proyectos for this year
    const { data: existingAsignaciones } = await admin
      .from('sistema_efemerides_proyectos')
      .select('efemeride_id, project_id, estado')
      .eq('anio', currentYear)

    const asignacionMap = new Map<string, string>()
    for (const a of existingAsignaciones || []) {
      asignacionMap.set(`${a.efemeride_id}:${a.project_id}`, a.estado)
    }

    // Get admin emails
    const { data: admins } = await admin
      .from('sistema_users')
      .select('email, nombre')
      .eq('role', 'admin')

    if (!admins || admins.length === 0) {
      return { success: true, notified: 0, message: 'No hay admins para notificar' }
    }

    let notifiedCount = 0

    for (const ef of efemerides) {
      const nextDate = new Date(currentYear, ef.fecha_mes - 1, ef.fecha_dia)
      const diffMs = nextDate.getTime() - now.getTime()
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      // Check if within anticipation window
      if (daysLeft > 0 && daysLeft <= ef.dias_anticipacion) {
        const key = `${ef.id}:anticipacion`
        if (notifiedSet.has(key)) continue

        // Find projects that don't have asset ready
        const pendingProjects = (allProjects || []).filter((p) => {
          const estado = asignacionMap.get(`${ef.id}:${p.id}`)
          return !estado || estado === 'pendiente' || estado === 'en_progreso'
        })

        // Send email to all admins
        for (const adm of admins) {
          await sendEmail({
            type: 'efemeride_reminder',
            to: adm.email,
            data: {
              recipientName: adm.nombre,
              efemerideName: ef.nombre,
              efemerideDate: `${ef.fecha_dia}/${ef.fecha_mes}/${currentYear}`,
              efemerideCategoria: ef.categoria,
              daysLeft,
              pendingProjects: pendingProjects.map((p) => p.nombre),
              actionUrl: 'https://quepia.com/sistema?view=efemerides',
            },
          })
        }

        // Log notification
        await admin
          .from('sistema_efemerides_notificaciones_log')
          .insert({
            efemeride_id: ef.id,
            anio: currentYear,
            tipo: 'anticipacion',
          })

        notifiedCount++
      }
    }

    return { success: true, notified: notifiedCount }
  } catch (err) {
    console.error('Error checking efemerides notificaciones:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error checking notifications',
    }
  }
}
