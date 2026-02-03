'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/sistema/supabase/client'
import type {
  ProposalTemplate,
  ProposalTemplateSection,
  ProposalTemplateItem,
} from '@/types/sistema'

export interface ProposalTemplateDetails extends ProposalTemplate {
  sections: ProposalTemplateSection[]
  items: ProposalTemplateItem[]
}

export function useProposalTemplates() {
  const [templates, setTemplates] = useState<ProposalTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('sistema_proposal_templates')
        .select('*')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setTemplates((data || []) as ProposalTemplate[])
      setError(null)
    } catch (err) {
      console.error('Error fetching proposal templates:', err)
      setError(err instanceof Error ? err.message : 'Error fetching templates')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const fetchTemplateDetails = useCallback(async (templateId: string): Promise<ProposalTemplateDetails | null> => {
    try {
      const supabase = createClient()
      const { data: template, error: templateError } = await supabase
        .from('sistema_proposal_templates')
        .select('*')
        .eq('id', templateId)
        .single()

      if (templateError || !template) throw templateError

      const { data: sections } = await supabase
        .from('sistema_proposal_template_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('position', { ascending: true })

      const { data: items } = await supabase
        .from('sistema_proposal_template_items')
        .select('*')
        .eq('template_id', templateId)
        .order('position', { ascending: true })

      return {
        ...(template as ProposalTemplateDetails),
        sections: sections || [],
        items: items || [],
      }
    } catch (err) {
      console.error('Error fetching proposal template details:', err)
      return null
    }
  }, [])

  return {
    templates,
    loading,
    error,
    refresh: fetchTemplates,
    fetchTemplateDetails,
  }
}
