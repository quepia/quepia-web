import type { Proyecto } from '@/types/database';
export function projectSlug(project: Pick<Proyecto, 'id' | 'titulo'>) {
  return `${project.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proyecto'}-${project.id}`;
}
