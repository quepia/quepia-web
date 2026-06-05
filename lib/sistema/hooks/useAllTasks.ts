'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, CalendarEvent } from '@/types/sistema';

export interface TaskWithProject extends Task {
  project?: { id: string; nombre: string; color: string; logo_url?: string | null } | null;
  assignee?: { id: string; nombre: string; avatar_url: string | null } | null;
  column?: { id: string; nombre: string } | null;
}

type UseAllOptions = {
  enabled?: boolean;
};

type UseAllCalendarEventsOptions = UseAllOptions & {
  from?: string;
  to?: string;
  syncEfemerides?: boolean;
};

export function useAllTasks(userId?: string, options?: UseAllOptions) {
  const enabled = options?.enabled ?? true;
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    initialLoadDone.current = false;
    if (!userId) {
      setTasks([]);
      setLoading(false);
    }
  }, [userId]);

  const fetchAllTasks = useCallback(async () => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    try {
      if (!initialLoadDone.current) {
        setLoading(true);
      }
      const res = await fetch(`/api/sistema-data?userId=${userId}&type=tasks`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setTasks(result.data || []);
    } catch (err) {
      console.error('Error fetching all tasks:', err);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [enabled, userId]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  return { tasks, loading, refresh: fetchAllTasks };
}

export function useAllCalendarEvents(userId?: string, options?: UseAllCalendarEventsOptions) {
  const enabled = options?.enabled ?? true;
  const from = options?.from;
  const to = options?.to;
  const syncEfemerides = options?.syncEfemerides ?? false;
  const [events, setEvents] = useState<(CalendarEvent & { project?: { id: string; nombre: string; color: string; logo_url?: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    requestIdRef.current += 1;
    initialLoadDone.current = false;
    if (!enabled || !userId) {
      if (!userId) {
        setEvents([]);
      }
      setLoading(false);
    }
  }, [enabled, from, syncEfemerides, to, userId]);

  const fetchAllEvents = useCallback(async () => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      if (!initialLoadDone.current) {
        setLoading(true);
      }
      const params = new URLSearchParams({
        userId,
        type: 'events',
      });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (syncEfemerides) params.set('syncEfemerides', 'true');

      const res = await fetch(`/api/sistema-data?${params.toString()}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (requestId !== requestIdRef.current) return;
      setEvents(result.data || []);
    } catch (err) {
      console.error('Error fetching all calendar events:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        initialLoadDone.current = true;
      }
    }
  }, [enabled, from, syncEfemerides, to, userId]);

  useEffect(() => {
    fetchAllEvents();
  }, [fetchAllEvents]);

  return { events, loading, refresh: fetchAllEvents };
}
