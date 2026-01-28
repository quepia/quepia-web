'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Task, Project, CalendarEvent } from '@/types/sistema';

export interface TaskWithProject extends Task {
  project?: { id: string; nombre: string; color: string } | null;
  assignee?: { id: string; nombre: string; avatar_url: string | null } | null;
  column?: { id: string; nombre: string } | null;
}

export function useAllTasks(userId?: string) {
  const [tasks, setTasks] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllTasks = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/sistema-data?userId=${userId}&type=tasks`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setTasks(result.data || []);
    } catch (err) {
      console.error('Error fetching all tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAllTasks();
  }, [fetchAllTasks]);

  return { tasks, loading, refresh: fetchAllTasks };
}

export function useAllCalendarEvents(userId?: string) {
  const [events, setEvents] = useState<(CalendarEvent & { project?: { id: string; nombre: string; color: string } })[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAllEvents = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`/api/sistema-data?userId=${userId}&type=events`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setEvents(result.data || []);
    } catch (err) {
      console.error('Error fetching all calendar events:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAllEvents();
  }, [fetchAllEvents]);

  return { events, loading, refresh: fetchAllEvents };
}
