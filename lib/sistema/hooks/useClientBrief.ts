'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { ClientBrief, ClientBriefInsert } from '@/types/sistema';

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function getBriefErrorDetails(error: unknown) {
  const value = error && typeof error === 'object' ? error as SupabaseErrorLike : null;
  const message = value?.message || (error instanceof Error ? error.message : 'No se pudo guardar el brief');
  const parts = [message, value?.details, value?.hint].filter(Boolean);

  if (value?.code === '42703' || value?.code === 'PGRST204') {
    parts.push('La base de datos no tiene aplicada la migración del brief creativo.');
  }

  if (value?.code === '42501') {
    parts.push('Tu usuario no tiene permisos para editar el brief de este proyecto.');
  }

  return {
    code: value?.code || 'UNKNOWN',
    message: parts.join(' '),
  };
}

export function useClientBrief(projectId: string | null) {
  const [brief, setBrief] = useState<ClientBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    if (!projectId) {
      setBrief(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('sistema_client_briefs')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();

      if (error) throw error;

      setBrief(data);
    } catch (err) {
      console.error('Error fetching brief:', err);
      setError(err instanceof Error ? err.message : 'Error fetching brief');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  const saveBrief = async (data: Omit<ClientBriefInsert, 'project_id'>) => {
    if (!projectId) return false;

    try {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      // Check if exists
      const { data: existing, error: lookupError } = await supabase
        .from('sistema_client_briefs')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();
      if (lookupError) throw lookupError;

      if (existing) {
        // Update
        const { error } = await supabase
          .from('sistema_client_briefs')
          .update({
            ...data,
            updated_at: new Date().toISOString()
          })
          .eq('project_id', projectId);
        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('sistema_client_briefs')
          .insert({
            ...data,
            project_id: projectId
          });
        if (error) throw error;
      }

      await fetchBrief();
      return true;
    } catch (err) {
      const failure = getBriefErrorDetails(err);
      console.warn('Brief save failed:', failure);
      setError(failure.message);
      throw new Error(failure.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    brief,
    loading,
    error,
    refresh: fetchBrief,
    saveBrief
  };
}
