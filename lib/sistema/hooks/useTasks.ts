'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type {
  Task,
  TaskInsert,
  TaskUpdate,
  TaskWithDetails,
  Column,
  ColumnWithTasks,
  Subtask,
  SubtaskInsert,
  SubtaskUpdate,
  Comment,
  CommentInsert,
  TaskLink,
  TaskLinkInsert,
  Priority,
  CommentWithUser,
} from '@/types/sistema';
import { sendNotification, notifyTaskComment } from '@/lib/sistema/actions/notifications';

export function useColumns(projectId?: string) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchColumns = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_columns')
        .select('*')
        .eq('project_id', projectId)
        .order('orden', { ascending: true });

      if (error) throw error;
      setColumns(data || []);
    } catch (err) {
      console.error('Error fetching columns:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchColumns();
  }, [fetchColumns]);

  const updateColumn = async (id: string, nombre: string): Promise<boolean> => {
    try {
      // Optimistic update
      setColumns(prev => prev.map(c => c.id === id ? { ...c, nombre } : c));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .update({ nombre })
        .eq('id', id);

      if (error) {
        await fetchColumns(); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error updating column:', err);
      return false;
    }
  };

  const updateColumnWipLimit = async (id: string, wipLimit: number | null): Promise<boolean> => {
    try {
      // Optimistic update
      setColumns(prev => prev.map(c => c.id === id ? { ...c, wip_limit: wipLimit } : c));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .update({ wip_limit: wipLimit })
        .eq('id', id);

      if (error) {
        await fetchColumns(); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error updating column WIP limit:', err);
      return false;
    }
  };

  const createColumn = async (nombre: string): Promise<Column | null> => {
    if (!projectId) return null;

    try {
      const supabase = createClient();
      const maxOrden = columns.length > 0 ? Math.max(...columns.map(c => c.orden)) : -1;

      const { data, error } = await supabase
        .from('sistema_columns')
        .insert({
          project_id: projectId,
          nombre,
          orden: maxOrden + 1,
        })
        .select()
        .single();

      if (error) throw error;

      // Optimistic: append new column
      if (data) {
        setColumns(prev => [...prev, data]);
      }
      return data;
    } catch (err) {
      console.error('Error creating column:', err);
      return null;
    }
  };

  const deleteColumn = async (id: string): Promise<boolean> => {
    try {
      // Optimistic: remove column
      setColumns(prev => prev.filter(c => c.id !== id));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .delete()
        .eq('id', id);

      if (error) {
        await fetchColumns(); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error deleting column:', err);
      return false;
    }
  };

  return {
    columns,
    loading,
    refresh: fetchColumns,
    updateColumn,
    updateColumnWipLimit,
    createColumn,
    deleteColumn,
  };
}

export function useTasks(projectId?: string) {
  const [columns, setColumns] = useState<ColumnWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  // Core fetch function - only shows loading spinner on initial load
  const fetchTasks = useCallback(async (silent = false) => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      // Only show loading on initial load, not on refetches
      if (!silent && !initialLoadDone.current) {
        setLoading(true);
      }
      const supabase = createClient();

      // Fetch columns for this project
      const { data: columnsData, error: columnsError } = await supabase
        .from('sistema_columns')
        .select('*')
        .eq('project_id', projectId)
        .order('orden', { ascending: true });

      if (columnsError) throw columnsError;

      // Fetch tasks for this project with assignee and parent task info
      const { data: tasksData, error: tasksError } = await supabase
        .from('sistema_tasks')
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url),
          parent_task:sistema_tasks!parent_task_id(id, titulo),
          assets:sistema_assets(
            id,
            approval_status,
            asset_type,
            group_id,
            group_order,
            current_version,
            versions:sistema_asset_versions(id, version_number, thumbnail_path, thumbnail_url, storage_path, file_url)
          )
        `)
        .eq('project_id', projectId)
        .order('orden', { ascending: true });

      if (tasksError) throw tasksError;

      // Fetch subtasks separately to avoid nested-relation inconsistencies in production.
      const taskIds = (tasksData || [])
        .map((task) => (typeof task?.id === 'string' ? task.id : null))
        .filter((id): id is string => Boolean(id));
      let subtasksByTaskId: Record<string, Subtask[]> = {};
      if (taskIds.length > 0) {
        const { data: subtasksData, error: subtasksError } = await supabase
          .from('sistema_subtasks')
          .select('id, task_id, titulo, completed, assignee_id, orden, created_at')
          .in('task_id', taskIds)
          .order('orden', { ascending: true });

        if (subtasksError) throw subtasksError;

        subtasksByTaskId = (subtasksData || []).reduce<Record<string, Subtask[]>>((acc, row) => {
          const subtask = row as Subtask;
          if (!acc[subtask.task_id]) {
            acc[subtask.task_id] = [];
          }
          acc[subtask.task_id].push(subtask);
          return acc;
        }, {});
      }

      // Build thumbnail signing map for latest asset previews
      const thumbPaths: string[] = [];
      const tasksWithThumbs: Task[] = (tasksData || []).map((task) => {
        const taskRecord = (task || {}) as Record<string, unknown>;
        const taskAssets = Array.isArray(taskRecord.assets) ? (taskRecord.assets as Record<string, unknown>[]) : [];
        const taskId = typeof taskRecord.id === "string" ? taskRecord.id : null;
        const taskSubtasks = taskId ? subtasksByTaskId[taskId] || [] : [];
        const assets = taskAssets.map((asset) => {
          const versions = Array.isArray(asset.versions) ? (asset.versions as Record<string, unknown>[]) : [];
          const latest =
            versions.find((v) => v.version_number === asset.current_version) ||
            versions[0];
          const path =
            (latest && typeof latest.thumbnail_path === "string" ? latest.thumbnail_path : null) ||
            (latest && typeof latest.thumbnail_url === "string" ? latest.thumbnail_url : null) ||
            (latest && typeof latest.storage_path === "string" ? latest.storage_path : null) ||
            (latest && typeof latest.file_url === "string" ? latest.file_url : null);
          if (path) thumbPaths.push(path);
          return {
            id: typeof asset.id === "string" ? asset.id : "",
            approval_status: typeof asset.approval_status === "string" ? asset.approval_status : "pending",
            thumbnail_url: path || null,
          };
        });
        const subtasks = taskSubtasks
          .map((subtask: Subtask) => ({
            id: typeof subtask.id === "string" ? subtask.id : "",
            task_id: typeof subtask.task_id === "string" ? subtask.task_id : "",
            titulo: typeof subtask.titulo === "string" ? subtask.titulo : "",
            completed: Boolean(subtask.completed),
            assignee_id: typeof subtask.assignee_id === "string" ? subtask.assignee_id : null,
            orden: typeof subtask.orden === "number" && Number.isFinite(subtask.orden) ? subtask.orden : 0,
            created_at: typeof subtask.created_at === "string" ? subtask.created_at : new Date(0).toISOString(),
          }))
          .sort((a, b) => a.orden - b.orden);
        const typeMetadata = taskRecord.type_metadata;
        const youtube =
          typeMetadata && typeof typeMetadata === "object"
            ? (typeMetadata as Record<string, unknown>).youtube
            : null;
        let youtubeThumbPath: string | null = null;
        if (youtube && typeof youtube === "object") {
          const youtubeRecord = youtube as Record<string, unknown>;
          youtubeThumbPath =
            (typeof youtubeRecord.thumbnail_path === "string" ? youtubeRecord.thumbnail_path : null) ||
            (typeof youtubeRecord.thumbnail_url === "string" ? youtubeRecord.thumbnail_url : null);
        }
        if (youtubeThumbPath) thumbPaths.push(youtubeThumbPath);
        return { ...taskRecord, assets, subtasks } as Task;
      });

      let signedMap: Record<string, string | null> = {};
      if (thumbPaths.length > 0) {
        try {
          const res = await fetch("/api/assets/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paths: Array.from(new Set(thumbPaths)) }),
          });
          const data = await res.json();
          signedMap = data?.urls || {};
        } catch (err) {
          console.warn("Error signing asset thumbnails:", err);
        }
      }

      const hydratedTasks: Task[] = tasksWithThumbs.map((task) => {
        const taskAssets = Array.isArray(task.assets) ? task.assets : [];
        const typeMetadata = task.type_metadata;

        return {
          ...task,
          assets: taskAssets.map((asset) => {
            const thumbRef = typeof asset.thumbnail_url === "string" ? asset.thumbnail_url : null;
            return {
              ...asset,
              thumbnail_url: thumbRef ? (signedMap[thumbRef] || thumbRef) : null,
            };
          }),
          type_metadata: (() => {
            if (!typeMetadata || typeof typeMetadata !== "object") return typeMetadata;
            const next = { ...(typeMetadata as Record<string, unknown>) };
            const youtube = next.youtube;
            if (!youtube || typeof youtube !== "object") return next;
            const youtubeRecord = youtube as Record<string, unknown>;
            const youtubeThumb =
              (typeof youtubeRecord.thumbnail_path === "string" ? youtubeRecord.thumbnail_path : null) ||
              (typeof youtubeRecord.thumbnail_url === "string" ? youtubeRecord.thumbnail_url : null);
            next.youtube = {
              ...youtubeRecord,
              thumbnail_url: youtubeThumb ? (signedMap[youtubeThumb] || youtubeThumb) : null,
            };
            return next;
          })(),
        } as Task;
      });

      // Combine columns with their tasks
      const columnsWithTasks: ColumnWithTasks[] = (columnsData || []).map((column: Column) => ({
        ...column,
        tasks: hydratedTasks.filter((task: Task) => task.column_id === column.id),
      }));

      setColumns(columnsWithTasks);
      setError(null);
      initialLoadDone.current = true;
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Error fetching tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Background refresh - never shows loading spinner
  const silentRefresh = useCallback(() => {
    return fetchTasks(true);
  }, [fetchTasks]);

  useEffect(() => {
    initialLoadDone.current = false;
    fetchTasks();
  }, [fetchTasks]);

  const createTask = async (task: TaskInsert): Promise<Task | null> => {
    try {
      const supabase = createClient();

      // Get the max orden for the column
      const { data: maxOrden } = await supabase
        .from('sistema_tasks')
        .select('orden')
        .eq('column_id', task.column_id)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      const newOrden = (maxOrden?.orden || 0) + 1;

      const { data, error: insertError } = await supabase
        .from('sistema_tasks')
        .insert({ ...task, orden: newOrden })
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url),
          parent_task:sistema_tasks!parent_task_id(id, titulo)
        `)
        .single();

      if (insertError) throw insertError;

      // Optimistic: add task to the correct column
      if (data) {
        setColumns(prev => prev.map(col =>
          col.id === task.column_id
            ? { ...col, tasks: [...col.tasks, data] }
            : col
        ));
      }

      // Handle notification for assignee (fire and forget)
      if (data && data.assignee_id) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user && data.assignee_id !== user.id) {
            sendNotification({
              userId: data.assignee_id!,
              actorId: user.id,
              type: 'assignment',
              title: `Nueva tarea asignada: ${data.titulo}`,
              content: `Te han asignado una nueva tarea en la columna ${task.column_id ? 'correspondiente' : ''}`,
              link: `/sistema?taskId=${data.id}`,
              data: { taskId: data.id, projectId: data.project_id }
            });
          }
        });
      }

      return data;
    } catch (err) {
      console.error('Error creating task:', err);
      setError(err instanceof Error ? err.message : 'Error creating task');
      await silentRefresh(); // Revert on error
      return null;
    }
  };

  const updateTask = async (id: string, updates: TaskUpdate): Promise<boolean> => {
    try {
      // If marking as completed, set completed_at
      if (updates.completed === true) {
        updates.completed_at = new Date().toISOString();
      } else if (updates.completed === false) {
        updates.completed_at = null;
      }

      // Optimistic update: apply changes to local state immediately
      setColumns(prev => prev.map(col => ({
        ...col,
        tasks: col.tasks.map(t =>
          t.id === id ? { ...t, ...updates } : t
        ),
      })));

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_tasks')
        .update(updates)
        .eq('id', id);

      if (updateError) {
        await silentRefresh(); // Revert on error
        throw updateError;
      }

      // If assignee changed, we need the full task data with joined relations
      if (updates.assignee_id !== undefined) {
        await silentRefresh();
      }

      return true;
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err instanceof Error ? err.message : 'Error updating task');
      return false;
    }
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    // Save previous state for rollback
    const prevColumns = columns;

    try {
      // Optimistic: remove task from local state
      setColumns(prev => prev.map(col => ({
        ...col,
        tasks: col.tasks.filter(t => t.id !== id),
      })));

      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_tasks')
        .delete()
        .eq('id', id);

      if (deleteError) {
        setColumns(prevColumns); // Revert on error
        throw deleteError;
      }

      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      setError(err instanceof Error ? err.message : 'Error deleting task');
      return false;
    }
  };

  const clearCompletedTasks = async (): Promise<number | null> => {
    if (!projectId) return 0;

    const completedTaskIds = columns
      .flatMap((column) => column.tasks)
      .filter((task) => task.completed)
      .map((task) => task.id);

    if (completedTaskIds.length === 0) return 0;

    const prevColumns = columns;

    try {
      // Optimistic: remove completed tasks from local state immediately
      setColumns((prev) =>
        prev.map((column) => ({
          ...column,
          tasks: column.tasks.filter((task) => !task.completed),
        }))
      );

      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_tasks')
        .delete()
        .eq('project_id', projectId)
        .eq('completed', true);

      if (deleteError) {
        setColumns(prevColumns); // Revert on error
        throw deleteError;
      }

      return completedTaskIds.length;
    } catch (err) {
      console.error('Error clearing completed tasks:', err);
      setError(err instanceof Error ? err.message : 'Error clearing completed tasks');
      return null;
    }
  };

  const moveTask = async (
    taskId: string,
    newColumnId: string,
    newOrden: number
  ): Promise<boolean> => {
    // Save previous state for rollback
    const prevColumns = columns;

    try {
      // Optimistic: move task between columns locally
      let movedTaskData: Task | undefined;
      setColumns(prev => {
        const updated = prev.map(col => {
          const taskInCol = col.tasks.find(t => t.id === taskId);
          if (taskInCol) {
            movedTaskData = taskInCol;
            return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
          }
          return col;
        });
        if (movedTaskData) {
          return updated.map(col =>
            col.id === newColumnId
              ? { ...col, tasks: [...col.tasks, { ...movedTaskData!, column_id: newColumnId, orden: newOrden }] }
              : col
          );
        }
        return updated;
      });

      const supabase = createClient();

      // Update task column and order
      const { data: movedTask, error: updateError } = await supabase
        .from('sistema_tasks')
        .update({ column_id: newColumnId, orden: newOrden })
        .eq('id', taskId)
        .select(`*, assignee:sistema_users(id), project:sistema_projects(nombre)`)
        .single();

      if (updateError) {
        setColumns(prevColumns); // Revert on error
        throw updateError;
      }

      // Notify assignee if not the current user (fire and forget)
      if (movedTask) {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (user && movedTask.assignee?.id && movedTask.assignee.id !== user.id) {
            const { data: newColumn } = await supabase
              .from('sistema_columns')
              .select('nombre')
              .eq('id', newColumnId)
              .single();

            sendNotification({
              userId: movedTask.assignee.id,
              actorId: user.id,
              type: 'status_change',
              title: `Tarea movida: ${movedTask.titulo}`,
              content: `La tarea fue movida a la columna "${newColumn?.nombre || 'Desconocida'}"`,
              link: `/sistema?taskId=${taskId}`,
              data: { taskId, projectId: movedTask.project_id, oldColumnId: movedTask.column_id, newColumnId }
            });
          }
        });
      }

      return true;
    } catch (err) {
      console.error('Error moving task:', err);
      setError(err instanceof Error ? err.message : 'Error moving task');
      return false;
    }
  };

  const reorderTasks = async (
    columnId: string,
    taskIds: string[]
  ): Promise<boolean> => {
    // Optimistic: reorder tasks in local state
    setColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      const taskMap = new Map(col.tasks.map(t => [t.id, t]));
      const reordered = taskIds
        .map((id, index) => {
          const t = taskMap.get(id);
          return t ? { ...t, orden: index, column_id: columnId } : null;
        })
        .filter(Boolean) as Task[];
      return { ...col, tasks: reordered };
    }));

    try {
      const supabase = createClient();

      // Update order for each task
      const updates = taskIds.map((id, index) =>
        supabase
          .from('sistema_tasks')
          .update({ orden: index, column_id: columnId })
          .eq('id', id)
      );

      await Promise.all(updates);
      return true;
    } catch (err) {
      console.error('Error reordering tasks:', err);
      setError(err instanceof Error ? err.message : 'Error reordering tasks');
      await silentRefresh(); // Revert on error
      return false;
    }
  };

  const duplicateTask = async (task: Task): Promise<Task | null> => {
    try {
      const supabase = createClient();

      // Get max orden for the column
      const { data: maxOrden } = await supabase
        .from('sistema_tasks')
        .select('orden')
        .eq('column_id', task.column_id)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      const newOrden = (maxOrden?.orden || 0) + 1;

      // Omit id, created_at, updated_at, completed_at
      const { id, created_at, updated_at, completed_at, ...taskData } = task;

      const { data, error: insertError } = await supabase
        .from('sistema_tasks')
        .insert({
          ...taskData,
          titulo: `${task.titulo} (Copia)`,
          orden: newOrden,
          completed: false
        })
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url),
          parent_task:sistema_tasks!parent_task_id(id, titulo)
        `)
        .single();

      if (insertError) throw insertError;

      // Optimistic: add duplicated task to the column
      if (data) {
        setColumns(prev => prev.map(col =>
          col.id === task.column_id
            ? { ...col, tasks: [...col.tasks, data] }
            : col
        ));
      }

      return data;
    } catch (err) {
      console.error('Error duplicating task:', err);
      setError(err instanceof Error ? err.message : 'Error duplicating task');
      return null;
    }
  };

  return {
    columns,
    loading,
    error,
    refresh: fetchTasks,
    silentRefresh,
    createTask,
    updateTask,
    deleteTask,
    clearCompletedTasks,
    moveTask,
    reorderTasks,
    duplicateTask,
  };
}

export function useTaskDetails(taskId?: string) {
  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedOnce = useRef(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    try {
      // Only show loading spinner on initial load
      if (!hasFetchedOnce.current) {
        setLoading(true);
      }
      const supabase = createClient();

      const { data, error: fetchError } = await supabase
        .from('sistema_tasks')
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url, email),
          project:sistema_projects(id, nombre, color),
          column:sistema_columns(id, nombre),
          subtasks:sistema_subtasks(
            *,
            assignee:sistema_users(id, nombre, avatar_url)
          ),
          comments:sistema_comments(
            *,
            user:sistema_users(id, nombre, avatar_url)
          ),
          links:sistema_task_links(*)
        `)
        .eq('id', taskId)
        .single();

      if (fetchError) throw fetchError;

      // Sort subtasks and comments
      if (data) {
        data.subtasks = (data.subtasks || []).sort(
          (a: Subtask, b: Subtask) => a.orden - b.orden
        );
        data.comments = (data.comments || []).sort(
          (a: Comment, b: Comment) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      setTask(data);
      setError(null);
      hasFetchedOnce.current = true;
    } catch (err) {
      console.error('Error fetching task details:', err);
      setError(err instanceof Error ? err.message : 'Error fetching task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    hasFetchedOnce.current = false;
    fetchTask();
  }, [fetchTask]);

  return {
    task,
    loading,
    error,
    refresh: fetchTask,
  };
}

export function useSubtasks(taskId?: string) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(false);
  const hasFetchedOnce = useRef(false);

  const fetchSubtasks = useCallback(async () => {
    if (!taskId) return;

    try {
      if (!hasFetchedOnce.current) {
        setLoading(true);
      }
      const supabase = createClient();

      const { data, error } = await supabase
        .from('sistema_subtasks')
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url)
        `)
        .eq('task_id', taskId)
        .order('orden', { ascending: true });

      if (error) throw error;

      setSubtasks(data || []);
      hasFetchedOnce.current = true;
    } catch (err) {
      console.error('Error fetching subtasks:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    hasFetchedOnce.current = false;
    fetchSubtasks();
  }, [fetchSubtasks]);

  const createSubtask = async (subtask: SubtaskInsert): Promise<boolean> => {
    try {
      const supabase = createClient();

      // Get max orden (guarding against invalid/null legacy data)
      const ordenValues = subtasks
        .map((s) => (typeof s.orden === 'number' && Number.isFinite(s.orden) ? s.orden : -1));
      const maxOrden = ordenValues.length > 0 ? Math.max(...ordenValues) : -1;

      const { error } = await supabase
        .from('sistema_subtasks')
        .insert({
          ...subtask,
          completed: subtask.completed ?? false,
          orden: maxOrden + 1,
        })

      if (error) throw error;

      // Sync from DB so ordering/relations stay consistent.
      await fetchSubtasks();

      // Notify task assignee (fire and forget)
      if (taskId) {
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (user) {
            const { data: task } = await supabase
              .from('sistema_tasks')
              .select('assignee_id, titulo, project_id')
              .eq('id', taskId)
              .single();

            if (task && task.assignee_id && task.assignee_id !== user.id) {
              sendNotification({
                userId: task.assignee_id,
                actorId: user.id,
                type: 'system',
                title: `Nueva subtarea en: ${task.titulo}`,
                content: `Se agregó la subtarea "${subtask.titulo}"`,
                link: `/sistema?taskId=${taskId}`,
                data: { taskId, projectId: task.project_id }
              });
            }
          }
        });
      }

      return true;
    } catch (err) {
      console.error('Error creating subtask:', err);
      return false;
    }
  };

  const updateSubtask = async (id: string, updates: SubtaskUpdate): Promise<boolean> => {
    try {
      // Optimistic update
      setSubtasks(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_subtasks')
        .update(updates)
        .eq('id', id);

      if (error) {
        await fetchSubtasks(); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error updating subtask:', err);
      return false;
    }
  };

  const deleteSubtask = async (id: string): Promise<boolean> => {
    const prevSubtasks = subtasks;
    try {
      // Optimistic: remove from local list
      setSubtasks(prev => prev.filter(s => s.id !== id));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_subtasks')
        .delete()
        .eq('id', id);

      if (error) {
        setSubtasks(prevSubtasks); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error deleting subtask:', err);
      return false;
    }
  };

  const toggleSubtask = async (id: string): Promise<boolean> => {
    const subtask = subtasks.find((s) => s.id === id);
    if (!subtask) return false;

    const success = await updateSubtask(id, { completed: !subtask.completed });

    if (success && taskId) {
       try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: task } = await supabase
              .from('sistema_tasks')
              .select('assignee_id, titulo, project_id')
              .eq('id', taskId)
              .single();

            if (task && task.assignee_id && task.assignee_id !== user.id) {
               await sendNotification({
                userId: task.assignee_id,
                actorId: user.id,
                type: 'system',
                title: `Subtarea ${!subtask.completed ? 'completada' : 'pendiente'}`,
                content: `En la tarea "${task.titulo}": ${subtask.titulo}`,
                link: `/sistema?taskId=${taskId}`,
                data: { taskId, projectId: task.project_id }
              });
            }
          }
       } catch (err) {
         console.error("Error sending subtask notification", err);
       }
    }

    return success;
  };

  const convertSubtaskToTask = async (
    subtaskId: string,
    columnId: string,
    options?: { assigneeId?: string | null; priority?: Priority }
  ): Promise<Task | null> => {
    try {
      const supabase = createClient();

      // Get subtask info
      const { data: subtask, error: subtaskError } = await supabase
        .from('sistema_subtasks')
        .select('*')
        .eq('id', subtaskId)
        .single();

      if (subtaskError || !subtask) throw new Error('Subtask not found');

      // Get parent task info
      const { data: parentTask, error: parentError } = await supabase
        .from('sistema_tasks')
        .select('project_id, titulo, assignee_id')
        .eq('id', subtask.task_id)
        .single();

      if (parentError || !parentTask) throw new Error('Parent task not found');

      // Get max orden for the column
      const { data: maxOrden } = await supabase
        .from('sistema_tasks')
        .select('orden')
        .eq('column_id', columnId)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      const newOrden = (maxOrden?.orden || 0) + 1;

      // Get current user for comment
      const { data: { user } } = await supabase.auth.getUser();

      // Create new task from subtask
      const { data: newTask, error: createError } = await supabase
        .from('sistema_tasks')
        .insert({
          project_id: parentTask.project_id,
          column_id: columnId,
          titulo: subtask.titulo,
          descripcion: null,
          assignee_id: options?.assigneeId ?? subtask.assignee_id,
          priority: options?.priority ?? 'P4',
          orden: newOrden,
          completed: subtask.completed,
          parent_task_id: subtask.task_id,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Add comment to new task referencing parent
      await supabase.from('sistema_comments').insert({
        task_id: newTask.id,
        user_id: user?.id || parentTask.assignee_id,
        contenido: `Convertida desde subtarea de: ${parentTask.titulo}`,
      });

      // Delete the subtask
      const { error: deleteError } = await supabase
        .from('sistema_subtasks')
        .delete()
        .eq('id', subtaskId);

      if (deleteError) throw deleteError;

      // Notify parent task assignee
      if (user && parentTask.assignee_id && parentTask.assignee_id !== user.id) {
        await sendNotification({
          userId: parentTask.assignee_id,
          actorId: user.id,
          type: 'system',
          title: `Subtarea convertida a tarea: ${subtask.titulo}`,
          content: `La subtarea "${subtask.titulo}" fue convertida a tarea independiente`,
          link: `/sistema?taskId=${newTask.id}`,
          data: { taskId: newTask.id, projectId: parentTask.project_id }
        });
      }

      // Optimistic: remove subtask from local list
      setSubtasks(prev => prev.filter(s => s.id !== subtaskId));

      return newTask;
    } catch (err) {
      console.error('Error converting subtask to task:', err);
      return null;
    }
  };

  return {
    subtasks,
    loading,
    refresh: fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    toggleSubtask,
    convertSubtaskToTask,
  };
}

export function useComments(taskId?: string) {
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [loading, setLoading] = useState(false);
  const hasFetchedOnce = useRef(false);

  const fetchComments = useCallback(async () => {
    if (!taskId) return;

    try {
      if (!hasFetchedOnce.current) {
        setLoading(true);
      }
      const supabase = createClient();

      const { data, error } = await supabase
        .from('sistema_comments')
        .select(`
          *,
          user:sistema_users(id, nombre, avatar_url),
          asset:sistema_assets(id, nombre),
          asset_version:sistema_asset_versions(id, version_number)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setComments(data || []);
      hasFetchedOnce.current = true;
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    hasFetchedOnce.current = false;
    fetchComments();
  }, [fetchComments]);

  const createComment = async (comment: CommentInsert): Promise<CommentWithUser | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_comments')
        .insert(comment)
        .select(`
          *,
          user:sistema_users(id, nombre, avatar_url),
          asset:sistema_assets(id, nombre),
          asset_version:sistema_asset_versions(id, version_number)
        `)
        .single();

      if (error) throw error;

      // Optimistic: prepend to comments list (ordered by created_at desc)
      if (data) {
        setComments(prev => [data, ...prev]);
      }

      // Notify (fire and forget)
      if (comment.task_id) {
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            notifyTaskComment(comment.task_id, comment.contenido, user.id);
          }
        });
      }

      return data;
    } catch (err) {
      console.error('Error creating comment:', err);
      return null;
    }
  };

  const deleteComment = async (id: string): Promise<boolean> => {
    const prevComments = comments;
    try {
      // Optimistic: remove from local list
      setComments(prev => prev.filter(c => c.id !== id));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_comments')
        .delete()
        .eq('id', id);

      if (error) {
        setComments(prevComments); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error deleting comment:', err);
      return false;
    }
  };

  return {
    comments,
    loading,
    refresh: fetchComments,
    createComment,
    deleteComment,
  };
}

export function useTaskLinks(taskId?: string) {
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [loading, setLoading] = useState(false);
  const hasFetchedOnce = useRef(false);

  const fetchLinks = useCallback(async () => {
    if (!taskId) return;

    try {
      if (!hasFetchedOnce.current) {
        setLoading(true);
      }
      const supabase = createClient();

      const { data, error } = await supabase
        .from('sistema_task_links')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLinks(data || []);
      hasFetchedOnce.current = true;
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    hasFetchedOnce.current = false;
    fetchLinks();
  }, [fetchLinks]);

  const createLink = async (link: TaskLinkInsert): Promise<TaskLink | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_task_links')
        .insert(link)
        .select()
        .single();

      if (error) throw error;

      // Optimistic: prepend to links list
      if (data) {
        setLinks(prev => [data, ...prev]);
      }

      return data;
    } catch (err) {
      console.error('Error creating link:', err);
      return null;
    }
  };

  const deleteLink = async (id: string): Promise<boolean> => {
    const prevLinks = links;
    try {
      // Optimistic: remove from local list
      setLinks(prev => prev.filter(l => l.id !== id));

      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_task_links')
        .delete()
        .eq('id', id);

      if (error) {
        setLinks(prevLinks); // Revert on error
        throw error;
      }

      return true;
    } catch (err) {
      console.error('Error deleting link:', err);
      return false;
    }
  };

  return {
    links,
    loading,
    refresh: fetchLinks,
    createLink,
    deleteLink,
  };
}
