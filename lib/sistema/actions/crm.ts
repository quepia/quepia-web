'use server'

import { createClient } from '@/lib/sistema/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createProjectFromLead(leadId: string, ownerId: string) {
  const supabase = await createClient()
  try {
    const { data: lead, error: leadError } = await supabase
      .from('sistema_crm_leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) throw leadError

    const { data: project, error: projectError } = await supabase
      .from('sistema_projects')
      .insert({
        nombre: lead.company_name,
        color: '#2AE7E4',
        icon: 'hash',
        owner_id: ownerId,
        logo_url: null,
        parent_id: null,
      })
      .select('id')
      .single()

    if (projectError) throw projectError

    await supabase
      .from('sistema_crm_leads')
      .update({ project_id: project?.id ?? null })
      .eq('id', leadId)

    revalidatePath('/sistema')
    return { success: true, projectId: project?.id }
  } catch (error) {
    console.error('Error creating project from lead:', error)
    return { success: false, error }
  }
}

export async function createDraftProposalFromLead(leadId: string) {
  const supabase = await createClient()
  try {
    const { data: lead, error: leadError } = await supabase
      .from('sistema_crm_leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) throw leadError

    const { data: proposal, error: proposalError } = await supabase
      .from('sistema_proposals')
      .insert({
        title: `Propuesta - ${lead.company_name}`,
        summary: lead.notes || null,
        currency: 'USD',
        status: 'draft',
        total_amount: lead.estimated_budget || 0,
        client_name: lead.contact_name || lead.company_name,
        client_email: lead.email || null,
      })
      .select('id')
      .single()

    if (proposalError) throw proposalError

    await supabase
      .from('sistema_crm_leads')
      .update({ proposal_id: proposal?.id ?? null })
      .eq('id', leadId)

    revalidatePath('/sistema')
    return { success: true, proposalId: proposal?.id }
  } catch (error) {
    console.error('Error creating proposal from lead:', error)
    return { success: false, error }
  }
}
