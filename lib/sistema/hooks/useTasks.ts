'use client';

import { useState, useEffect, useCallback } from 'react';
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
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .update({ nombre })
        .eq('id', id);

      if (error) throw error;

      await fetchColumns();
      return true;
    } catch (err) {
      console.error('Error updating column:', err);
      return false;
    }
  };

  const updateColumnWipLimit = async (id: string, wipLimit: number | null): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .update({ wip_limit: wipLimit })
        .eq('id', id);

      if (error) throw error;

      await fetchColumns();
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

      await fetchColumns();
      return data;
    } catch (err) {
      console.error('Error creating column:', err);
      return null;
    }
  };

  const deleteColumn = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_columns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchColumns();
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

  const fetchTasks = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const supabase = createClient();

      // Fetch columns for this project
      const { data: columnsData, error: columnsError } = await supabase
        .from('sistema_columns')
        .select('*')
        .eq('project_id', projectId)
        .order('orden', { ascending: true });

      if (columnsError) throw columnsError;

      // Fetch tasks for this project with assignee info
      const { data: tasksData, error: tasksError } = await supabase
        .from('sistema_tasks')
        .select(`
          *,
          assignee:sistema_users(id, nombre, avatar_url)
        `)
        .eq('project_id', projectId)
        .order('orden', { ascending: true });

      if (tasksError) throw tasksError;

      // Combine columns with their tasks
      const columnsWithTasks: ColumnWithTasks[] = (columnsData || []).map((column: Column) => ({
        ...column,
        tasks: (tasksData || []).filter((task: Task) => task.column_id === column.id),
      }));

      setColumns(columnsWithTasks);
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Error fetching tasks');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
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
        .select()
        .single();

      if (insertError) throw insertError;

      // Handle notification for assignee
      if (data && data.assignee_id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && data.assignee_id !== user.id) {
          await sendNotification({
            userId: data.assignee_id,
            actorId: user.id,
            type: 'assignment',
            title: `Nueva tarea asignada: ${data.titulo}`,
            content: `Te han asignado una nueva tarea en la columna ${task.column_id ? 'correspondiente' : ''}`, // Could fetch column name but maybe overkill
            link: `/sistema?taskId=${data.id}`,
            data: { taskId: data.id, projectId: data.project_id }
          })
        }
      }

      await fetchTasks();
      return data;
    } catch (err) {
      console.error('Error creating task:', err);
      setError(err instanceof Error ? err.message : 'Error creating task');
      return null;
    }
  };

  const updateTask = async (id: string, updates: TaskUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();

      // If marking as completed, set completed_at
      if (updates.completed === true) {
        updates.completed_at = new Date().toISOString();
      } else if (updates.completed === false) {
        updates.completed_at = null;
      }

      const { error: updateError } = await supabase
        .from('sistema_tasks')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error updating task:', err);
      setError(err instanceof Error ? err.message : 'Error updating task');
      return false;
    }
  };

  const deleteTask = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_tasks')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error deleting task:', err);
      setError(err instanceof Error ? err.message : 'Error deleting task');
      return false;
    }
  };

  const moveTask = async (
    taskId: string,
    newColumnId: string,
    newOrden: number
  ): Promise<boolean> => {
    try {
      const supabase = createClient();

      // Update task column and order
      const { data: movedTask, error: updateError } = await supabase
        .from('sistema_tasks')
        .update({ column_id: newColumnId, orden: newOrden })
        .eq('id', taskId)
        .select(`*, assignee:sistema_users(id), project:sistema_projects(nombre)`)
        .single();

      if (updateError) throw updateError;

      // Notify assignee if not the current user (we'll need current user id)
      // Since this is a client hook, we can get the user session
      const { data: { user } } = await supabase.auth.getUser();

      if (movedTask && user && movedTask.assignee?.id && movedTask.assignee.id !== user.id) {
        // Get new column name
        const { data: newColumn } = await supabase
          .from('sistema_columns')
          .select('nombre')
          .eq('id', newColumnId)
          .single()

        await sendNotification({
          userId: movedTask.assignee.id,
          actorId: user.id,
          type: 'status_change',
          title: `Tarea movida: ${movedTask.titulo}`,
          content: `La tarea fue movida a la columna "${newColumn?.nombre || 'Desconocida'}"`,
          link: `/sistema?taskId=${taskId}`,
          data: { taskId, projectId: movedTask.project_id, oldColumnId: movedTask.column_id, newColumnId }
        })
      }

      await fetchTasks();
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
      await fetchTasks();
      return true;
    } catch (err) {
      console.error('Error reordering tasks:', err);
      setError(err instanceof Error ? err.message : 'Error reordering tasks');
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
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchTasks();
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
    createTask,
    updateTask,
    deleteTask,
    moveTask,
    reorderTasks,
    duplicateTask,
  };
}

export function useTaskDetails(taskId?: string) {
  const [task, setTask] = useState<TaskWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
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
    } catch (err) {
      console.error('Error fetching task details:', err);
      setError(err instanceof Error ? err.message : 'Error fetching task');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
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

  const fetchSubtasks = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
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
    } catch (err) {
      console.error('Error fetching subtasks:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchSubtasks();
  }, [fetchSubtasks]);

  const createSubtask = async (subtask: SubtaskInsert): Promise<Subtask | null> => {
    try {
      const supabase = createClient();

      // Get max orden
      const maxOrden = subtasks.length > 0
        ? Math.max(...subtasks.map((s) => s.orden))
        : -1;

      const { data, error } = await supabase
        .from('sistema_subtasks')
        .insert({ ...subtask, orden: maxOrden + 1 })
        .select()
        .single();

      if (error) throw error;

      // Notify task assignee
      const { data: { user } } = await supabase.auth.getUser();
      if (user && taskId) {
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
            title: `Nueva subtarea en: ${task.titulo}`,
            content: `Se agregó la subtarea "${subtask.titulo}"`,
            link: `/sistema?taskId=${taskId}`,
            data: { taskId, projectId: task.project_id }
          });
        }
      }

      await fetchSubtasks();
      return data;
    } catch (err) {
      console.error('Error creating subtask:', err);
      return null;
    }
  };

  const updateSubtask = async (id: string, updates: SubtaskUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_subtasks')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      await fetchSubtasks();
      return true;
    } catch (err) {
      console.error('Error updating subtask:', err);
      return false;
    }
  };

  const deleteSubtask = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_subtasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchSubtasks();
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

  return {
    subtasks,
    loading,
    refresh: fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    toggleSubtask,
  };
}

export function useComments(taskId?: string) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from('sistema_comments')
        .select(`
          *,
          user:sistema_users(id, nombre, avatar_url)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setComments(data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const createComment = async (comment: CommentInsert): Promise<Comment | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_comments')
        .insert(comment)
        .select(`
          *,
          user:sistema_users(id, nombre, avatar_url)
        `)
        .single();

      if (error) throw error;

      // Notify
      const { data: { user } } = await supabase.auth.getUser();
      if (user && comment.task_id) {
        await notifyTaskComment(comment.task_id, comment.contenido, user.id);
      }

      await fetchComments();
      return data;
    } catch (err) {
      console.error('Error creating comment:', err);
      return null;
    }
  };

  const deleteComment = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_comments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchComments();
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

  const fetchLinks = useCallback(async () => {
    if (!taskId) return;

    try {
      setLoading(true);
      const supabase = createClient();

      const { data, error } = await supabase
        .from('sistema_task_links')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setLinks(data || []);
    } catch (err) {
      console.error('Error fetching links:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
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

      await fetchLinks();
      return data;
    } catch (err) {
      console.error('Error creating link:', err);
      return null;
    }
  };

  const deleteLink = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_task_links')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchLinks();
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
