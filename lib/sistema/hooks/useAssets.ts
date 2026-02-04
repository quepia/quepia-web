'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import { serverCreateAsset, serverAddVersion, serverGetAssetsForTask } from '@/lib/sistema/actions/assets';
import type {
  Asset,
  AssetInsert,
  AssetVersion,
  AssetVersionInsert,
  AssetWithVersions,
  Annotation,
  AnnotationInsert,
  AnnotationWithAuthor,
  ApprovalStatus,
  ApprovalLogEntry,
} from '@/types/sistema';

export function useAssets(taskId?: string) {
  const [assets, setAssets] = useState<AssetWithVersions[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssets = useCallback(async () => {
    if (!taskId) { setLoading(false); return; }
    try {
      setLoading(true);
      const res = await serverGetAssetsForTask(taskId);
      if (!res.success) throw new Error(res.error);
      setAssets(res.data || []);
    } catch (err) {
      console.error('Error fetching assets:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const createAsset = async (asset: AssetInsert): Promise<Asset | null> => {
    try {
      const result = await serverCreateAsset(asset);
      if (!result.success) throw new Error(result.error);
      await fetchAssets();
      return result.data!;
    } catch (err) {
      console.error('Error creating asset:', err);
      return null;
    }
  };

  const addVersion = async (version: AssetVersionInsert): Promise<AssetVersion | null> => {
    try {
      const result = await serverAddVersion(version);
      if (!result.success) throw new Error(result.error);
      await fetchAssets();
      return result.data!;
    } catch (err) {
      console.error('Error adding version:', err);
      return null;
    }
  };

  const updateApprovalStatus = async (
    assetId: string,
    status: ApprovalStatus,
    note?: string
  ): Promise<boolean> => {
    try {
      const supabase = createClient();

      // Check if asset has unresolved critical annotations when trying to approve
      if (status === 'approved_final') {
        const asset = assets.find(a => a.id === assetId);
        if (asset && asset.versions && asset.versions.length > 0) {
          const latestVersion = asset.versions[0];
          const { data: unresolvedAnnotations } = await supabase
            .from('sistema_annotations')
            .select('id')
            .eq('asset_version_id', latestVersion.id)
            .eq('resolved', false)
            .in('feedback_type', ['correction_critical', 'correction_minor']);

          if (unresolvedAnnotations && unresolvedAnnotations.length > 0) {
            alert(`No se puede aprobar: hay ${unresolvedAnnotations.length} anotaciones sin resolver.`);
            return false;
          }
        }
      }

      const { error } = await supabase
        .from('sistema_assets')
        .update({ approval_status: status })
        .eq('id', assetId);

      if (error) throw error;
      await fetchAssets();
      return true;
    } catch (err) {
      console.error('Error updating approval status:', err);
      return false;
    }
  };

  const deleteAsset = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('sistema_assets').delete().eq('id', id);
      if (error) throw error;
      await fetchAssets();
      return true;
    } catch (err) {
      console.error('Error deleting asset:', err);
      return false;
    }
  };

  /**
   * Optimistically reorder carousel assets in local state.
   * Updates group_order values based on new order array.
   */
  const optimisticReorder = (assetIds: string[]) => {
    setAssets(prev => {
      const updated = [...prev];
      assetIds.forEach((id, index) => {
        const assetIdx = updated.findIndex(a => a.id === id);
        if (assetIdx !== -1) {
          updated[assetIdx] = { ...updated[assetIdx], group_order: index };
        }
      });
      // Re-sort to ensure correct order in UI
      return updated.sort((a, b) => {
        // First sort by group_id, then by group_order
        if (a.group_id && b.group_id && a.group_id === b.group_id) {
          return (a.group_order ?? 0) - (b.group_order ?? 0);
        }
        return 0;
      });
    });
  };

  return {
    assets,
    loading,
    refresh: fetchAssets,
    createAsset,
    addVersion,
    updateApprovalStatus,
    deleteAsset,
    optimisticReorder,
  };
}

export function useAnnotations(versionId?: string) {
  const [annotations, setAnnotations] = useState<AnnotationWithAuthor[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAnnotations = useCallback(async () => {
    if (!versionId) return;
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_annotations')
        .select(`
          *,
          author:sistema_users!sistema_annotations_author_id_fkey(id, nombre, avatar_url),
          resolved_by_user:sistema_users!sistema_annotations_resolved_by_fkey(id, nombre, avatar_url)
        `)
        .eq('asset_version_id', versionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setAnnotations(data || []);
    } catch (err) {
      console.error('Error fetching annotations:', err);
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => { fetchAnnotations(); }, [fetchAnnotations]);

  const createAnnotation = async (annotation: AnnotationInsert): Promise<Annotation | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_annotations')
        .insert(annotation)
        .select()
        .single();
      if (error) throw error;
      await fetchAnnotations();
      return data;
    } catch (err) {
      console.error('Error creating annotation:', err);
      return null;
    }
  };

  const resolveAnnotation = async (id: string, userId: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_annotations')
        .update({ resolved: true, resolved_by: userId, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await fetchAnnotations();
      return true;
    } catch (err) {
      console.error('Error resolving annotation:', err);
      return false;
    }
  };

  const unresolveAnnotation = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_annotations')
        .update({ resolved: false, resolved_by: null, resolved_at: null })
        .eq('id', id);
      if (error) throw error;
      await fetchAnnotations();
      return true;
    } catch (err) {
      console.error('Error unresolving annotation:', err);
      return false;
    }
  };

  const deleteAnnotation = async (id: string): Promise<boolean> => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('sistema_annotations').delete().eq('id', id);
      if (error) throw error;
      await fetchAnnotations();
      return true;
    } catch (err) {
      console.error('Error deleting annotation:', err);
      return false;
    }
  };

  return {
    annotations,
    loading,
    refresh: fetchAnnotations,
    createAnnotation,
    resolveAnnotation,
    unresolveAnnotation,
    deleteAnnotation,
  };
}

export function useApprovalLog(assetId?: string) {
  const [log, setLog] = useState<ApprovalLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    if (!assetId) return;
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from('sistema_approval_log')
        .select(`
          *,
          user:sistema_users(id, nombre, avatar_url)
        `)
        .eq('asset_id', assetId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLog(data || []);
    } catch (err) {
      console.error('Error fetching approval log:', err);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  return { log, loading, refresh: fetchLog };
}
