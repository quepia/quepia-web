'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Task, Project, CalendarEvent } from '@/types/sistema';

export interface TaskWithProject extends Task {
  project?: { id: string; nombre: string; color: string; logo_url?: string | null } | null;
  assignee?: { id: string; nombre: string; avatar_url: string | null } | null;
  column?: { id: string; nombre: string } | null;
}

type UseAllOptions = {
  enabled?: boolean;
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

export function useAllCalendarEvents(userId?: string, options?: UseAllOptions) {
  const enabled = options?.enabled ?? true;
  const [events, setEvents] = useState<(CalendarEvent & { project?: { id: string; nombre: string; color: string; logo_url?: string | null } })[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    initialLoadDone.current = false;
    if (!userId) {
      setEvents([]);
      setLoading(false);
    }
  }, [userId]);

  const fetchAllEvents = useCallback(async () => {
    if (!enabled || !userId) {
      setLoading(false);
      return;
    }

    try {
      if (!initialLoadDone.current) {
        setLoading(true);
      }
      const res = await fetch(`/api/sistema-data?userId=${userId}&type=events`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setEvents(result.data || []);
    } catch (err) {
      console.error('Error fetching all calendar events:', err);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, [enabled, userId]);

  useEffect(() => {
    fetchAllEvents();
  }, [fetchAllEvents]);

  return { events, loading, refresh: fetchAllEvents };
}
