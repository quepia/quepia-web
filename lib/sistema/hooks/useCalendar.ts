'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type {
  CalendarEvent,
  CalendarEventInsert,
  CalendarEventUpdate,
  ClientAccess,
  ClientAccessInsert,
  ClientAccessUpdate,
} from '@/types/sistema';
import { notifyClientFeedback, notifyClientAssetStatus } from '@/lib/sistema/actions/notifications';

export function useCalendarEvents(projectId?: string) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from('sistema_calendar_events')
        .select(`
          *,
          comments:sistema_calendar_comments(*)
        `)
        .eq('project_id', projectId)
        .order('fecha_inicio', { ascending: true });

      if (fetchError) throw fetchError;

      setEvents(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching calendar events:', err);
      setError(err instanceof Error ? err.message : 'Error fetching events');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const createEvent = async (event: CalendarEventInsert): Promise<CalendarEvent | null> => {
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from('sistema_calendar_events')
        .insert(event)
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchEvents();
      return data;
    } catch (err) {
      console.error('Error creating event:', err);
      setError(err instanceof Error ? err.message : 'Error creating event');
      return null;
    }
  };

  const updateEvent = async (id: string, updates: CalendarEventUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_calendar_events')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      await fetchEvents();
      return true;
    } catch (err) {
      console.error('Error updating event:', err);
      setError(err instanceof Error ? err.message : 'Error updating event');
      return false;
    }
  };

  const deleteEvent = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_calendar_events')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchEvents();
      return true;
    } catch (err) {
      console.error('Error deleting event:', err);
      setError(err instanceof Error ? err.message : 'Error deleting event');
      return false;
    }
  };

  return {
    events,
    loading,
    error,
    refresh: fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}

export function useClientAccess(projectId?: string) {
  const [clients, setClients] = useState<ClientAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from('sistema_client_access')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      setClients(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching client access:', err);
      setError(err instanceof Error ? err.message : 'Error fetching clients');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const createClientAccess = async (client: ClientAccessInsert): Promise<ClientAccess | null> => {
    try {
      const supabase = createClient();
      const payload: ClientAccessInsert = {
        ...client,
        notify_asset_delivery: client.notify_asset_delivery ?? true,
        delivery_email: client.delivery_email ?? client.email,
      };
      const { data, error: insertError } = await supabase
        .from('sistema_client_access')
        .insert(payload)
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchClients();
      return data;
    } catch (err) {
      console.error('Error creating client access:', err);
      setError(err instanceof Error ? err.message : 'Error creating client access');
      return null;
    }
  };

  const updateClientAccess = async (id: string, updates: ClientAccessUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_client_access')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      await fetchClients();
      return true;
    } catch (err) {
      console.error('Error updating client access:', err);
      setError(err instanceof Error ? err.message : 'Error updating client');
      return false;
    }
  };

  const deleteClientAccess = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_client_access')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchClients();
      return true;
    } catch (err) {
      console.error('Error deleting client access:', err);
      setError(err instanceof Error ? err.message : 'Error deleting client');
      return false;
    }
  };

  const getShareableLink = (token: string): string => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/cliente/${token}`;
  };

  return {
    clients,
    loading,
    error,
    refresh: fetchClients,
    createClientAccess,
    updateClientAccess,
    deleteClientAccess,
    getShareableLink,
  };
}

// Public function to get client data (no auth required)
export async function getPublicClientData(token: string) {
  try {
    const res = await fetch(`/api/client/data?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error fetching public client data:', err);
    return { error: 'Error fetching data' };
  }
}

export async function updatePublicAssetStatus(token: string, assetId: string, status: string, rating?: number) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public_update_asset_status', {
      token,
      asset_id: assetId,
      status,
      rating
    });

    if (error) {
      console.error('Supabase RPC Error in updatePublicAssetStatus:', JSON.stringify(error, null, 2));
      throw error;
    }
    if (data && typeof data === 'object' && 'error' in data) {
      console.error('Logic Error in updatePublicAssetStatus:', data.error);
      throw new Error(data.error);
    }

    // Notify team members about client status change
    await notifyClientAssetStatus(token, assetId, status, { mirrorToTask: rating === undefined });

    return { success: true, data };
  } catch (err: any) {
    console.error('Exception in updatePublicAssetStatus:', JSON.stringify(err, null, 2), err?.message, err?.code);
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

export async function addPublicAnnotation(token: string, assetVersionId: string, content: string, x: number, y: number, feedbackType = 'correction_minor', authorName: string) {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('public_add_asset_annotation', {
      token,
      asset_version_id: assetVersionId,
      content,
      x_percent: x,
      y_percent: y,
      feedback_type: feedbackType,
      author_name: authorName
    });

    if (error) {
      console.error('Supabase RPC Error in addPublicAnnotation:', JSON.stringify(error, null, 2));
      throw error;
    }
    if (data && typeof data === 'object' && 'error' in data) {
      console.error('Logic Error in addPublicAnnotation:', data.error);
      throw new Error(data.error);
    }

    // Notify team
    await notifyClientFeedback(token, assetVersionId, content, authorName);

    return { success: true, data };
  } catch (err: any) {
    console.error('Exception in addPublicAnnotation:', JSON.stringify(err, null, 2), err?.message, err?.code);
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}


export async function getPublicClientDataV2(sessionToken: string) {
  try {
    const res = await fetch(`/api/client/data?token=${encodeURIComponent(sessionToken)}`, {
      cache: 'no-store',
    });
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Error fetching V2 client data:', err);
    return { error: 'Error fetching data or session expired' };
  }
}
