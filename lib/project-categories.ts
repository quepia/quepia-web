import { CATEGORIES, type Proyecto, type WorkCategory } from '@/types/database'

const CATEGORY_IDS = new Set<WorkCategory>(CATEGORIES.map((category) => category.id))
const CATEGORY_LABELS = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.label]))

type ProjectCategorySource = Pick<Proyecto, 'categoria' | 'categorias'>

export function isWorkCategory(value: string): value is WorkCategory {
  return CATEGORY_IDS.has(value as WorkCategory)
}

export function normalizeWorkCategories(values: Array<string | null | undefined>): WorkCategory[] {
  const normalized: WorkCategory[] = []

  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed || !isWorkCategory(trimmed)) continue
    if (normalized.includes(trimmed)) continue
    normalized.push(trimmed)
  }

  return normalized
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS.get(category) ?? category.replace(/-/g, ' ')
}

export function getProjectCategories(project: ProjectCategorySource): WorkCategory[] {
  return normalizeWorkCategories([project.categoria, ...(project.categorias ?? [])])
}

export function getPrimaryProjectCategory(project: ProjectCategorySource): WorkCategory {
  return getProjectCategories(project)[0] ?? CATEGORIES[0]?.id ?? 'branding'
}

export function getProjectCategoryLabels(project: ProjectCategorySource): string[] {
  return getProjectCategories(project).map(getCategoryLabel)
}

export function projectMatchesCategory(project: ProjectCategorySource, category: WorkCategory): boolean {
  return getProjectCategories(project).includes(category)
}
