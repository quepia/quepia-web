'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { TaskDependency } from '@/types/sistema';

export function useTaskDependencies(taskId?: string) {
  const [dependencies, setDependencies] = useState<TaskDependency[]>([]);
  const [dependents, setDependents] = useState<TaskDependency[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDependencies = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      const supabase = createClient();

      // Tasks this task depends on
      const { data: deps } = await supabase
        .from('sistema_task_dependencies')
        .select('*')
        .eq('task_id', taskId);

      // Tasks that depend on this task
      const { data: depts } = await supabase
        .from('sistema_task_dependencies')
        .select('*')
        .eq('depends_on_id', taskId);

      setDependencies(deps || []);
      setDependents(depts || []);
    } catch (err) {
      console.error('Error fetching dependencies:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchDependencies();
  }, [fetchDependencies]);

  const addDependency = async (dependsOnId: string): Promise<boolean> => {
    if (!taskId || taskId === dependsOnId) return false;

    try {
      const supabase = createClient();

      // Check for circular dependency
      const { data: reverse } = await supabase
        .from('sistema_task_dependencies')
        .select('id')
        .eq('task_id', dependsOnId)
        .eq('depends_on_id', taskId)
        .single();

      if (reverse) {
        console.error('Circular dependency detected');
        return false;
      }

      const { error } = await supabase
        .from('sistema_task_dependencies')
        .insert({ task_id: taskId, depends_on_id: dependsOnId });

      if (error) throw error;

      await fetchDependencies();
      return true;
    } catch (err) {
      console.error('Error adding dependency:', err);
      return false;
    }
  };

  const removeDependency = async (dependsOnId: string): Promise<boolean> => {
    if (!taskId) return false;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_task_dependencies')
        .delete()
        .eq('task_id', taskId)
        .eq('depends_on_id', dependsOnId);

      if (error) throw error;

      await fetchDependencies();
      return true;
    } catch (err) {
      console.error('Error removing dependency:', err);
      return false;
    }
  };

  return {
    dependencies,
    dependents,
    loading,
    refresh: fetchDependencies,
    addDependency,
    removeDependency,
  };
}
