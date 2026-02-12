'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { ProjectTemplate, ProjectTemplateInsert } from '@/types/sistema';

type UseTemplatesOptions = {
  enabled?: boolean;
};

export function useProjectTemplates(options?: UseTemplatesOptions) {
  const enabled = options?.enabled ?? true;
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTemplates = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_project_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Error fetching templates:', message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const createTemplate = async (template: ProjectTemplateInsert): Promise<ProjectTemplate | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_project_templates')
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      await fetchTemplates();
      return data;
    } catch (err) {
      console.error('Error creating template:', err);
      return null;
    }
  };

  const deleteTemplate = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_project_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchTemplates();
      return true;
    } catch (err) {
      console.error('Error deleting template:', err);
      return false;
    }
  };

  const createProjectFromTemplate = async (
    templateId: string,
    projectName: string,
    ownerId: string,
    color: string,
    parentId?: string | null
  ): Promise<string | null> => {
    try {
      const template = templates.find(t => t.id === templateId);
      if (!template) return null;

      const supabase = createClient();

      // Create the project
      const { data: project, error: projectError } = await supabase
        .from('sistema_projects')
        .insert({
          nombre: projectName,
          color,
          icon: 'hash',
          parent_id: parentId || null,
          owner_id: ownerId,
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Delete default columns (created by trigger) and create template columns
      const { data: defaultCols } = await supabase
        .from('sistema_columns')
        .select('id')
        .eq('project_id', project.id);

      if (defaultCols && defaultCols.length > 0) {
        await supabase
          .from('sistema_columns')
          .delete()
          .in('id', defaultCols.map(c => c.id));
      }

      // Create template columns
      const columnsToInsert = template.structure.columns.map((col, i) => ({
        project_id: project.id,
        nombre: col.name,
        orden: col.order ?? i,
        wip_limit: col.wip_limit || null,
      }));

      const { data: newColumns, error: colError } = await supabase
        .from('sistema_columns')
        .insert(columnsToInsert)
        .select();

      if (colError) throw colError;

      // Create template tasks
      if (template.structure.default_tasks && newColumns) {
        const tasksToInsert = template.structure.default_tasks.map((task, i) => ({
          project_id: project.id,
          column_id: newColumns[task.column_index]?.id || newColumns[0].id,
          titulo: task.title,
          descripcion: task.description || null,
          social_copy: task.social_copy || null,
          link: task.link || null,
          task_type: task.type || null,
          priority: task.priority || 'P4',
          estimated_hours: task.estimated_hours || null,
          type_metadata: task.type_metadata || null,
          orden: i,
        }));

        await supabase.from('sistema_tasks').insert(tasksToInsert);
      }

      return project.id;
    } catch (err) {
      console.error('Error creating project from template:', err);
      return null;
    }
  };

  return {
    templates,
    loading,
    refresh: fetchTemplates,
    createTemplate,
    deleteTemplate,
    createProjectFromTemplate,
  };
}
