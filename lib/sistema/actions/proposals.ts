'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProposalStatus } from '@/types/sistema'
import { sendEmail } from '@/lib/sistema/email-service'

interface ProposalSectionPayload {
  temp_id: string
  title: string
  description?: string | null
  moodboard_links?: { label: string; url: string }[]
  position: number
}

interface ProposalItemPayload {
  temp_id: string
  section_temp_id?: string | null
  title: string
  description?: string | null
  quantity: number
  unit_price: number
  total_price: number
  position: number
}

interface SaveProposalPayload {
  proposal: {
    id?: string
    project_id?: string | null
    client_access_id?: string | null
    client_name?: string | null
    client_email?: string | null
    title: string
    summary?: string | null
    currency?: 'ARS' | 'USD' | 'EUR'
    status?: ProposalStatus
    total_amount?: number
    auto_create_payment?: boolean
    created_by?: string | null
  }
  sections: ProposalSectionPayload[]
  items: ProposalItemPayload[]
}

export async function saveProposal(payload: SaveProposalPayload) {
  const supabase = await createClient()

  try {
    const { proposal, sections, items } = payload

    let proposalId = proposal.id

    if (proposalId) {
      const { error: updateError } = await supabase
        .from('sistema_proposals')
        .update({
          project_id: proposal.project_id ?? null,
          client_access_id: proposal.client_access_id ?? null,
          client_name: proposal.client_name ?? null,
          client_email: proposal.client_email ?? null,
          title: proposal.title,
          summary: proposal.summary ?? null,
          currency: proposal.currency ?? 'ARS',
          status: proposal.status ?? 'draft',
          total_amount: proposal.total_amount ?? 0,
          auto_create_payment: proposal.auto_create_payment ?? false,
        })
        .eq('id', proposalId)

      if (updateError) throw updateError
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('sistema_proposals')
        .insert({
          project_id: proposal.project_id ?? null,
          client_access_id: proposal.client_access_id ?? null,
          client_name: proposal.client_name ?? null,
          client_email: proposal.client_email ?? null,
          title: proposal.title,
          summary: proposal.summary ?? null,
          currency: proposal.currency ?? 'ARS',
          status: proposal.status ?? 'draft',
          total_amount: proposal.total_amount ?? 0,
          auto_create_payment: proposal.auto_create_payment ?? false,
          created_by: proposal.created_by ?? null,
        })
        .select('id')
        .single()

      if (insertError) throw insertError
      proposalId = inserted?.id
    }

    if (!proposalId) throw new Error('No se pudo guardar la propuesta')

    // Clear existing sections/items
    await supabase.from('sistema_proposal_items').delete().eq('proposal_id', proposalId)
    await supabase.from('sistema_proposal_sections').delete().eq('proposal_id', proposalId)

    // Insert sections with temp_id mapping
    const sectionIdMap = new Map<string, string>()
    for (const section of sections) {
      const { data: insertedSection, error: sectionError } = await supabase
        .from('sistema_proposal_sections')
        .insert({
          proposal_id: proposalId,
          title: section.title,
          description: section.description ?? null,
          moodboard_links: section.moodboard_links ?? [],
          position: section.position,
        })
        .select('id')
        .single()

      if (sectionError) throw sectionError
      if (insertedSection?.id) sectionIdMap.set(section.temp_id, insertedSection.id)
    }

    // Insert items
    for (const item of items) {
      const sectionId = item.section_temp_id ? sectionIdMap.get(item.section_temp_id) : null
      const { error: itemError } = await supabase
        .from('sistema_proposal_items')
        .insert({
          proposal_id: proposalId,
          section_id: sectionId ?? null,
          title: item.title,
          description: item.description ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          position: item.position,
        })

      if (itemError) throw itemError
    }

    revalidatePath('/sistema')
    return { success: true, id: proposalId }
  } catch (error) {
    console.error('Error saving proposal:', error)
    return { success: false, error }
  }
}

export async function getProposalByToken(token: string) {
  const supabase = await createClient()

  try {
    const { data: proposal, error } = await supabase
      .from('sistema_proposals')
      .select(`
        *,
        project:sistema_projects(*)
      `)
      .eq('public_token', token)
      .single()

    if (error) throw error

    const { data: sections } = await supabase
      .from('sistema_proposal_sections')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('position', { ascending: true })

    const { data: items } = await supabase
      .from('sistema_proposal_items')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('position', { ascending: true })

    const { data: comments } = await supabase
      .from('sistema_proposal_comments')
      .select('*')
      .eq('proposal_id', proposal.id)
      .order('created_at', { ascending: true })

    return { success: true, data: { ...proposal, sections: sections || [], items: items || [], comments: comments || [] } }
  } catch (error) {
    console.error('Error fetching proposal by token:', error)
    return { success: false, error }
  }
}

export async function postProposalComment(proposalId: string, content: string, authorName: string, isClient = true) {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .from('sistema_proposal_comments')
      .insert({
        proposal_id: proposalId,
        content,
        author_name: authorName,
        is_client: isClient,
      })
      .select()

    if (error) throw error
    return { success: true, data }
  } catch (error) {
    console.error('Error posting proposal comment:', error)
    return { success: false, error }
  }
}

export async function submitProposalDecision(token: string, status: ProposalStatus) {
  const supabase = await createClient()

  try {
    const updates: Record<string, any> = { status }
    const now = new Date().toISOString()

    if (status === 'accepted') updates.accepted_at = now
    if (status === 'rejected') updates.rejected_at = now
    if (status === 'changes_requested') updates.changes_requested_at = now

    const { data: proposal, error } = await supabase
      .from('sistema_proposals')
      .update(updates)
      .eq('public_token', token)
      .select()
      .single()

    if (error) throw error

    let warning: string | null = null

    if (status === 'accepted' && proposal?.auto_create_payment && proposal?.project_id) {
      if (proposal.currency === 'EUR') {
        warning = 'La contabilidad aún no soporta EUR. Creá el pago manualmente.'
      } else {
        const month = new Date().getMonth() + 1
        const year = new Date().getFullYear()
        const { data: payment, error: paymentError } = await supabase
          .from('accounting_client_payments')
          .insert({
            project_id: proposal.project_id,
            month,
            year,
            amount: proposal.total_amount || 0,
            currency: proposal.currency,
            status: 'pending',
            notes: `Propuesta aceptada #${proposal.proposal_number ?? proposal.id}`,
          })
          .select('id')
          .single()

        if (paymentError) {
          console.error('Error creating payment from proposal:', paymentError)
          warning = 'La propuesta fue aceptada, pero no se pudo crear el pago automáticamente.'
        } else if (payment?.id) {
          await supabase
            .from('sistema_proposals')
            .update({ accounting_payment_id: payment.id })
            .eq('id', proposal.id)
        }
      }
    }

    revalidatePath(`/propuesta/${token}`)
    return { success: true, data: proposal, warning }
  } catch (error) {
    console.error('Error submitting proposal decision:', error)
    return { success: false, error }
  }
}

export async function sendProposalEmail(proposalId: string) {
  const supabase = await createClient()

  try {
    const { data: proposal, error } = await supabase
      .from('sistema_proposals')
      .select('*, project:sistema_projects(nombre)')
      .eq('id', proposalId)
      .single()

    if (error || !proposal) throw error

    const toEmail = proposal.client_email
    const clientName = proposal.client_name || 'Cliente'

    if (!toEmail) {
      return { success: false, error: 'La propuesta no tiene email de cliente.' }
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://quepia.com'
    const link = `${baseUrl}/propuesta/${proposal.public_token}`

    await sendEmail({
      type: 'proposal',
      to: toEmail,
      data: {
        clientName,
        proposalTitle: proposal.title,
        proposalSummary: proposal.summary || '',
        totalAmount: Number(proposal.total_amount || 0).toFixed(2),
        currency: proposal.currency,
        projectName: proposal.project?.nombre || '',
        actionUrl: link,
      },
    })

    await supabase
      .from('sistema_proposals')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', proposalId)

    revalidatePath('/sistema')
    return { success: true }
  } catch (error) {
    console.error('Error sending proposal email:', error)
    return { success: false, error }
  }
}

interface ProposalTemplateSectionPayload {
  temp_id: string
  title: string
  description?: string | null
  moodboard_links?: { label: string; url: string }[]
  position: number
}

interface ProposalTemplateItemPayload {
  temp_id: string
  section_temp_id?: string | null
  title: string
  description?: string | null
  quantity: number
  unit_price: number
  total_price: number
  position: number
}

export async function saveProposalTemplate(payload: {
  name: string
  description?: string | null
  currency?: 'ARS' | 'USD' | 'EUR'
  created_by?: string | null
  sections: ProposalTemplateSectionPayload[]
  items: ProposalTemplateItemPayload[]
}) {
  const supabase = await createClient()

  try {
    const { data: template, error: templateError } = await supabase
      .from('sistema_proposal_templates')
      .insert({
        name: payload.name,
        description: payload.description ?? null,
        currency: payload.currency ?? 'ARS',
        created_by: payload.created_by ?? null,
      })
      .select('id')
      .single()

    if (templateError) throw templateError

    const templateId = template?.id
    if (!templateId) throw new Error('No se pudo crear la plantilla')

    const sectionIdMap = new Map<string, string>()
    for (const section of payload.sections) {
      const { data: insertedSection, error: sectionError } = await supabase
        .from('sistema_proposal_template_sections')
        .insert({
          template_id: templateId,
          title: section.title,
          description: section.description ?? null,
          moodboard_links: section.moodboard_links ?? [],
          position: section.position,
        })
        .select('id')
        .single()

      if (sectionError) throw sectionError
      if (insertedSection?.id) sectionIdMap.set(section.temp_id, insertedSection.id)
    }

    for (const item of payload.items) {
      const sectionId = item.section_temp_id ? sectionIdMap.get(item.section_temp_id) : null
      const { error: itemError } = await supabase
        .from('sistema_proposal_template_items')
        .insert({
          template_id: templateId,
          section_id: sectionId ?? null,
          title: item.title,
          description: item.description ?? null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
          position: item.position,
        })

      if (itemError) throw itemError
    }

    revalidatePath('/sistema')
    return { success: true, id: templateId }
  } catch (error) {
    console.error('Error saving proposal template:', error)
    return { success: false, error }
  }
}

export async function deleteProposalTemplate(templateId: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase
      .from('sistema_proposal_templates')
      .delete()
      .eq('id', templateId)

    if (error) throw error
    revalidatePath('/sistema')
    return { success: true }
  } catch (error) {
    console.error('Error deleting proposal template:', error)
    return { success: false, error }
  }
}

export async function createPaymentFromProposal(proposalId: string) {
  const supabase = await createClient()

  try {
    const { data: proposal, error } = await supabase
      .from('sistema_proposals')
      .select('*')
      .eq('id', proposalId)
      .single()

    if (error || !proposal) throw error

    if (!proposal.project_id) {
      return { success: false, error: 'La propuesta no tiene proyecto asociado.' }
    }

    if (proposal.currency === 'EUR') {
      return { success: false, error: 'La contabilidad aún no soporta EUR.' }
    }

    const month = new Date().getMonth() + 1
    const year = new Date().getFullYear()

    const { data: payment, error: paymentError } = await supabase
      .from('accounting_client_payments')
      .insert({
        project_id: proposal.project_id,
        month,
        year,
        amount: proposal.total_amount || 0,
        currency: proposal.currency,
        status: 'pending',
        notes: `Pago generado desde propuesta #${proposal.proposal_number ?? proposal.id}`,
      })
      .select('id')
      .single()

    if (paymentError) throw paymentError

    await supabase
      .from('sistema_proposals')
      .update({ accounting_payment_id: payment?.id ?? null })
      .eq('id', proposalId)

    revalidatePath('/sistema')
    return { success: true, paymentId: payment?.id }
  } catch (error) {
    console.error('Error creating payment from proposal:', error)
    return { success: false, error }
  }
}
