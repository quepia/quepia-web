'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/sistema/supabase/client'
import type { CrmStage, CrmLead, CrmLeadInsert, CrmLeadUpdate } from '@/types/sistema'

export interface CrmLeadWithStage extends CrmLead {
  stage?: CrmStage | null
}

export function useCrmPipeline() {
  const [stages, setStages] = useState<CrmStage[]>([])
  const [leads, setLeads] = useState<CrmLeadWithStage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStages = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('sistema_crm_stages')
      .select('*')
      .order('position', { ascending: true })

    if (fetchError) throw fetchError
    return (data || []) as CrmStage[]
  }, [])

  const fetchLeads = useCallback(async () => {
    const supabase = createClient()
    const { data, error: fetchError } = await supabase
      .from('sistema_crm_leads')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError
    return (data || []) as CrmLead[]
  }, [])

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      const [stageData, leadData] = await Promise.all([fetchStages(), fetchLeads()])
      setStages(stageData)
      setLeads(
        leadData.map((lead) => ({
          ...lead,
          stage: stageData.find((s) => s.id === lead.status_id) || null,
        }))
      )
    } catch (err) {
      console.error('Error fetching CRM data:', err)
      setError(err instanceof Error ? err.message : 'Error fetching CRM data')
    } finally {
      setLoading(false)
    }
  }, [fetchStages, fetchLeads])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createLead = async (lead: CrmLeadInsert): Promise<CrmLead | null> => {
    try {
      const supabase = createClient()
      const { data, error: insertError } = await supabase
        .from('sistema_crm_leads')
        .insert(lead)
        .select()
        .single()

      if (insertError) throw insertError
      await refresh()
      return data as CrmLead
    } catch (err) {
      console.error('Error creating lead:', err)
      setError(err instanceof Error ? err.message : 'Error creating lead')
      return null
    }
  }

  const updateLead = async (id: string, updates: CrmLeadUpdate): Promise<boolean> => {
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase
        .from('sistema_crm_leads')
        .update(updates)
        .eq('id', id)

      if (updateError) throw updateError
      await refresh()
      return true
    } catch (err) {
      console.error('Error updating lead:', err)
      setError(err instanceof Error ? err.message : 'Error updating lead')
      return false
    }
  }

  const deleteLead = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('sistema_crm_leads')
        .delete()
        .eq('id', id)

      if (deleteError) throw deleteError
      await refresh()
      return true
    } catch (err) {
      console.error('Error deleting lead:', err)
      setError(err instanceof Error ? err.message : 'Error deleting lead')
      return false
    }
  }

  return {
    stages,
    leads,
    loading,
    error,
    refresh,
    createLead,
    updateLead,
    deleteLead,
  }
}
