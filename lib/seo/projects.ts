import { correctProjectCopy } from './public-copy';
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import type { Proyecto } from '@/types/database';
export type PublicProject = Proyecto & { ciudad?: string | null; updated_at?: string | null; fecha_actualizacion?: string | null };
export { projectSlug } from './projects-slug';
export const getPublicProjects = unstable_cache(async (): Promise<PublicProject[]> => {
  const { data, error } = await createPublicClient().from('proyectos').select('*').order('orden');
  if (error) throw new Error(`No se pudo cargar el portfolio: ${error.message}`);
  return (data || []).map(correctProjectCopy);
}, ['public-seo-projects'], { revalidate: 300 });
