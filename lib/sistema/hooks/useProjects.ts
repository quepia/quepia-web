'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type {
  Project,
  ProjectInsert,
  ProjectUpdate,
  ProjectWithChildren,
} from '@/types/sistema';

type ProjectCountPayload = number | { count: number | null }[] | null | undefined;
type ProjectApiRow = Project & { task_count?: ProjectCountPayload };
type FavoriteProjectPayload = ProjectApiRow | ProjectApiRow[] | null;
type FavoriteProjectRow = { project: FavoriteProjectPayload };

function normalizeTaskCount(taskCount: ProjectCountPayload): number {
  if (typeof taskCount === 'number') {
    return taskCount;
  }

  if (Array.isArray(taskCount) && typeof taskCount[0]?.count === 'number') {
    return taskCount[0].count;
  }

  return 0;
}

function normalizeFavoriteProject(project: FavoriteProjectPayload): ProjectApiRow | null {
  if (!project) return null;
  return Array.isArray(project) ? project[0] || null : project;
}

export function useProjects(userId?: string) {
  const [projects, setProjects] = useState<ProjectWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async (force = false) => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(`/api/sistema-data?userId=${userId}&type=projects${force ? '&force=true' : ''}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);

      // Build tree structure from flat list
      const projectsWithCounts = ((result.data || []) as ProjectApiRow[]).map((p) => ({
        ...p,
        task_count: normalizeTaskCount(p.task_count),
      }));

      const tree = buildProjectTree(projectsWithCounts);
      setProjects(tree);
      setError(null);
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError(err instanceof Error ? err.message : 'Error fetching projects');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (project: ProjectInsert): Promise<Project | null> => {
    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from('sistema_projects')
        .insert(project)
        .select()
        .single();

      if (insertError) throw insertError;

      await fetchProjects(true);
      return data;
    } catch (err) {
      console.error('Error creating project:', err);
      setError(err instanceof Error ? err.message : 'Error creating project');
      return null;
    }
  };

  const updateProject = async (id: string, updates: ProjectUpdate): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('sistema_projects')
        .update(updates)
        .eq('id', id);

      if (updateError) throw updateError;

      await fetchProjects(true);
      return true;
    } catch (err) {
      console.error('Error updating project:', err);
      setError(err instanceof Error ? err.message : 'Error updating project');
      return false;
    }
  };

  const deleteProject = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error: deleteError } = await supabase
        .from('sistema_projects')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      await fetchProjects(true);
      return true;
    } catch (err) {
      console.error('Error deleting project:', err);
      setError(err instanceof Error ? err.message : 'Error deleting project');
      return false;
    }
  };

  return {
    projects,
    loading,
    error,
    refresh: fetchProjects,
    createProject,
    updateProject,
    deleteProject,
  };
}

// Helper function to build tree structure
function buildProjectTree(projects: (Project & { task_count?: number })[]): ProjectWithChildren[] {
  const projectMap = new Map<string, ProjectWithChildren>();
  const rootProjects: ProjectWithChildren[] = [];

  // First pass: create map of all projects
  projects.forEach((project) => {
    projectMap.set(project.id, { ...project, children: [] });
  });

  // Second pass: build tree
  projects.forEach((project) => {
    const projectWithChildren = projectMap.get(project.id)!;
    if (project.parent_id && projectMap.has(project.parent_id)) {
      const parent = projectMap.get(project.parent_id)!;
      parent.children = parent.children || [];
      parent.children.push(projectWithChildren);
    } else {
      rootProjects.push(projectWithChildren);
    }
  });

  // Sort children by orden
  const sortChildren = (projects: ProjectWithChildren[]) => {
    projects.sort((a, b) => a.orden - b.orden);
    projects.forEach((p) => {
      if (p.children && p.children.length > 0) {
        sortChildren(p.children);
      }
    });
  };

  sortChildren(rootProjects);

  return rootProjects;
}

export function useFavorites(userId?: string) {
  const [favorites, setFavorites] = useState<ProjectWithChildren[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_favorites')
        .select(`
          project:sistema_projects(
            *,
            task_count:sistema_tasks(count)
          )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      const favProjects = (data || [])
        .map((f): ProjectWithChildren | null => {
          const project = normalizeFavoriteProject((f as FavoriteProjectRow).project);
          if (!project) return null;
          return {
            ...project,
            task_count: normalizeTaskCount(project.task_count),
          };
        })
        .filter((project): project is ProjectWithChildren => project !== null);

      setFavorites(favProjects);
    } catch (err) {
      console.error('Error fetching favorites:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const addFavorite = async (projectId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_favorites')
        .insert({ user_id: userId, project_id: projectId });

      if (error) throw error;

      await fetchFavorites();
      return true;
    } catch (err) {
      console.error('Error adding favorite:', err);
      return false;
    }
  };

  const removeFavorite = async (projectId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('project_id', projectId);

      if (error) throw error;

      await fetchFavorites();
      return true;
    } catch (err) {
      console.error('Error removing favorite:', err);
      return false;
    }
  };

  const isFavorite = (projectId: string): boolean => {
    return favorites.some((f) => f.id === projectId);
  };

  return {
    favorites,
    loading,
    refresh: fetchFavorites,
    addFavorite,
    removeFavorite,
    isFavorite,
  };
}
