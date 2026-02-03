'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/sistema/supabase/client'
import type { Proposal, ProposalWithDetails, ProposalComment } from '@/types/sistema'
import type { Project } from '@/types/sistema'

export interface ProposalSummary extends Proposal {
  project?: Pick<Project, 'id' | 'nombre' | 'color' | 'logo_url'> | null
  client_access?: { id: string; nombre: string; email: string } | null
}

export interface ProposalDetails extends ProposalWithDetails {
  project?: Project | null
  comments?: ProposalComment[]
}

export function useProposals(projectId?: string) {
  const [proposals, setProposals] = useState<ProposalSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      let query = supabase
        .from('sistema_proposals')
        .select(`
          *,
          project:sistema_projects(id, nombre, color, logo_url),
          client_access:sistema_client_access(id, nombre, email)
        `)
        .order('created_at', { ascending: false })

      if (projectId) {
        query = query.eq('project_id', projectId)
      }

      const { data, error: fetchError } = await query
      if (fetchError) throw fetchError

      setProposals((data || []) as ProposalSummary[])
      setError(null)
    } catch (err) {
      console.error('Error fetching proposals:', err)
      setError(err instanceof Error ? err.message : 'Error fetching proposals')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  const fetchProposalDetails = useCallback(async (proposalId: string): Promise<ProposalDetails | null> => {
    try {
      const supabase = createClient()
      const { data: proposal, error: proposalError } = await supabase
        .from('sistema_proposals')
        .select(`
          *,
          project:sistema_projects(*)
        `)
        .eq('id', proposalId)
        .single()

      if (proposalError || !proposal) throw proposalError

      const { data: sections } = await supabase
        .from('sistema_proposal_sections')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true })

      const { data: items } = await supabase
        .from('sistema_proposal_items')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('position', { ascending: true })

      const { data: comments } = await supabase
        .from('sistema_proposal_comments')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: true })

      return {
        ...(proposal as ProposalDetails),
        sections: sections || [],
        items: items || [],
        comments: comments || [],
      }
    } catch (err) {
      console.error('Error fetching proposal details:', err)
      return null
    }
  }, [])

  const deleteProposal = useCallback(async (proposalId: string): Promise<boolean> => {
    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase
        .from('sistema_proposals')
        .delete()
        .eq('id', proposalId)

      if (deleteError) throw deleteError
      await fetchProposals()
      return true
    } catch (err) {
      console.error('Error deleting proposal:', err)
      setError(err instanceof Error ? err.message : 'Error deleting proposal')
      return false
    }
  }, [fetchProposals])

  return {
    proposals,
    loading,
    error,
    refresh: fetchProposals,
    fetchProposalDetails,
    deleteProposal,
  }
}

export interface ClientAccessSummary {
  id: string
  project_id: string
  email: string
  nombre: string
  project?: { id: string; nombre: string; color: string }
}

export function useAllClientAccess() {
  const [clients, setClients] = useState<ClientAccessSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('sistema_client_access')
        .select('*, project:sistema_projects(id, nombre, color)')
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError
      setClients((data || []) as ClientAccessSummary[])
      setError(null)
    } catch (err) {
      console.error('Error fetching client access:', err)
      setError(err instanceof Error ? err.message : 'Error fetching clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [fetchClients])

  return {
    clients,
    loading,
    error,
    refresh: fetchClients,
  }
}
