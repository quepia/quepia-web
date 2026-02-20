'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { createAdminClient } from '@/lib/sistema/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/sistema/email-service'

interface SubirAssetParams {
  efemeride_id: string
  project_id: string
  anio: number
  asset_url: string
  asset_storage_path?: string
  thumbnail_url?: string
  notas?: string
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

    // 2. Create calendar event for the efemeride date
    const eventDate = new Date(params.anio, efemeride.fecha_mes - 1, efemeride.fecha_dia)
    const eventDateStr = eventDate.toISOString()

    const { data: calendarEvent, error: eventError } = await admin
      .from('sistema_calendar_events')
      .insert({
        project_id: params.project_id,
        titulo: `Efeméride: ${efemeride.nombre}`,
        descripcion: efemeride.descripcion || `Publicación para ${efemeride.nombre}`,
        tipo: 'publicacion',
        fecha_inicio: eventDateStr,
        todo_el_dia: true,
        color: project.color || '#22c55e',
        created_by: userId,
      })
      .select()
      .single()

    if (eventError) {
      console.error('Error creating calendar event:', eventError)
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
    if (calendarEvent) updatePayload.calendar_event_id = calendarEvent.id
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
