'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type {
  Efemeride,
  EfemerideInsert,
  EfemerideUpdate,
  EfemerideProyecto,
  EfemerideProyectoUpdate,
} from '@/types/sistema';

function getNextOccurrence(mes: number, dia: number): Date {
  const now = new Date();
  const thisYear = now.getFullYear();
  let next = new Date(thisYear, mes - 1, dia);
  if (next < now) {
    next = new Date(thisYear + 1, mes - 1, dia);
  }
  return next;
}

function daysUntil(date: Date): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function useEfemerides() {
  const [efemerides, setEfemerides] = useState<Efemeride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEfemerides = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('sistema_efemerides')
        .select('*')
        .order('fecha_mes', { ascending: true })
        .order('fecha_dia', { ascending: true });

      if (fetchError) throw fetchError;
      setEfemerides(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching efemerides:', err);
      setError(err instanceof Error ? err.message : 'Error fetching efemerides');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEfemerides();
  }, [fetchEfemerides]);

  const createEfemeride = async (efemeride: EfemerideInsert): Promise<Efemeride | null> => {
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from('sistema_efemerides')
        .insert(efemeride)
        .select()
        .single();

      if (insertError) throw insertError;
      await fetchEfemerides();
      return data;
    } catch (err) {
      console.error('Error creating efemeride:', err);
      setError(err instanceof Error ? err.message : 'Error creating efemeride');
      return null;
    }
  };

  const updateEfemeride = async (id: string, updates: EfemerideUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_efemerides')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
      await fetchEfemerides();
      return true;
    } catch (err) {
      console.error('Error updating efemeride:', err);
      setError(err instanceof Error ? err.message : 'Error updating efemeride');
      return false;
    }
  };

  const deleteEfemeride = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_efemerides')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      await fetchEfemerides();
      return true;
    } catch (err) {
      console.error('Error deleting efemeride:', err);
      setError(err instanceof Error ? err.message : 'Error deleting efemeride');
      return false;
    }
  };

  const proximasEfemerides = useMemo(() => {
    return efemerides
      .filter((e) => e.activa)
      .map((e) => {
        const next = getNextOccurrence(e.fecha_mes, e.fecha_dia);
        return { ...e, nextDate: next, daysUntil: daysUntil(next) };
      })
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [efemerides]);

  return {
    efemerides,
    loading,
    error,
    fetchEfemerides,
    createEfemeride,
    updateEfemeride,
    deleteEfemeride,
    proximasEfemerides,
  };
}

export function useEfemeridesProyectos(projectIds?: string[]) {
  const [asignaciones, setAsignaciones] = useState<EfemerideProyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAsignaciones = useCallback(async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      let query = supabase
        .from('sistema_efemerides_proyectos')
        .select('*')
        .order('anio', { ascending: false });

      if (projectIds && projectIds.length > 0) {
        query = query.in('project_id', projectIds);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setAsignaciones(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching efemerides proyectos:', err);
      setError(err instanceof Error ? err.message : 'Error fetching asignaciones');
    } finally {
      setLoading(false);
    }
  }, [projectIds?.join(',')]);

  useEffect(() => {
    fetchAsignaciones();
  }, [fetchAsignaciones]);

  const updateAsignacion = async (id: string, updates: EfemerideProyectoUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_efemerides_proyectos')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;
      await fetchAsignaciones();
      return true;
    } catch (err) {
      console.error('Error updating asignacion:', err);
      setError(err instanceof Error ? err.message : 'Error updating asignacion');
      return false;
    }
  };

  return {
    asignaciones,
    loading,
    error,
    fetchAsignaciones,
    updateAsignacion,
  };
}
