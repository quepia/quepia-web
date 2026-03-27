// Database types for Sistema de Gestión de Proyectos

// Priority levels
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

// Task status based on kanban columns
export type TaskStatus = 'planificacion' | 'material-producir' | 'edicion' | 'listo-publicar' | 'completado';

// Task types
export type TaskType = 'diseno' | 'copy' | 'video' | 'strategy' | 'revision' | 'otro';

// Organization-level user roles
export type OrgRole = 'superadmin' | 'admin_org' | 'team_member' | 'client_guest';

// Project icon types
export type ProjectIcon = 'folder' | 'hash' | 'briefcase' | 'building-2' | 'store' | 'globe' | 'laptop' | 'megaphone' | 'camera' | 'pen-tool' | 'music' | 'video' | 'code' | 'type';

// Project resource types
export type ProjectResourceType = 'social' | 'drive' | 'design' | 'link' | 'other';

export interface ProjectResource {
  id: string;
  title: string;
  url: string;
  type: ProjectResourceType;
  icon?: string;
}

// ============ USERS ============
export interface SistemaUser {
  id: string;
  email: string;
  nombre: string;
  avatar_url: string | null;
  role: 'admin' | 'user' | 'manager';
  is_active?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
}

export interface SistemaUserInsert {
  email: string;
  nombre: string;
  avatar_url?: string | null;
}

// ============ PROJECTS ============
export interface Project {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  icon: ProjectIcon;
  parent_id: string | null;
  owner_id: string;
  orden: number;
  logo_url?: string | null;
  resources: ProjectResource[];
  created_at: string;
  updated_at: string;
}

export interface ProjectInsert {
  nombre: string;
  descripcion?: string | null;
  color?: string;
  icon?: ProjectIcon;
  parent_id?: string | null;
  owner_id: string;
  orden?: number;
  logo_url?: string | null;
  resources?: ProjectResource[];
}

export interface ProjectUpdate {
  nombre?: string;
  descripcion?: string | null;
  color?: string;
  icon?: ProjectIcon;
  parent_id?: string | null;
  orden?: number;
  logo_url?: string | null;
  resources?: ProjectResource[];
}

// Project with nested children for sidebar
export interface ProjectWithChildren extends Project {
  children?: ProjectWithChildren[];
  task_count?: number;
}

// ============ COLUMNS (Kanban) ============
export interface Column {
  id: string;
  project_id: string;
  nombre: string;
  orden: number;
  wip_limit: number | null;
  color: string | null;
  created_at: string;
}

export interface ColumnInsert {
  project_id: string;
  nombre: string;
  orden?: number;
  wip_limit?: number | null;
  color?: string | null;
}

export interface ColumnUpdate {
  nombre?: string;
  orden?: number;
  wip_limit?: number | null;
  color?: string | null;
}

// Column with tasks for kanban board
export interface ColumnWithTasks extends Column {
  tasks: Task[];
}

// ============ TASKS ============
export interface Task {
  id: string;
  project_id: string;
  column_id: string;
  titulo: string;
  descripcion: string | null;
  link: string | null;
  assignee_id: string | null;
  priority: Priority;
  social_copy?: string | null;
  due_date: string | null;
  deadline: string | null;
  labels: string[];
  orden: number;
  completed: boolean;
  completed_at: string | null;
  task_type: TaskType | null;
  estimated_hours: number | null;
  blocking_subtasks: boolean;
  type_metadata: Record<string, any> | null;
  parent_task_id: string | null;
  parent_task?: { id: string; titulo: string } | null;
  subtasks?: Subtask[];
  assets?: { id: string; approval_status: ApprovalStatus; asset_type?: AssetType; group_id?: string | null; group_order?: number; thumbnail_url?: string | null }[] | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInsert {
  project_id: string;
  column_id: string;
  titulo: string;
  descripcion?: string | null;
  link?: string | null;
  assignee_id?: string | null;
  priority?: Priority;
  due_date?: string | null;
  deadline?: string | null;
  labels?: string[];
  orden?: number;
  task_type?: TaskType | null;
  estimated_hours?: number | null;
  blocking_subtasks?: boolean;
  type_metadata?: Record<string, any> | null;
  parent_task_id?: string | null;
}

export interface TaskUpdate {
  column_id?: string;
  titulo?: string;
  descripcion?: string | null;
  link?: string | null;
  assignee_id?: string | null;
  priority?: Priority;
  due_date?: string | null;
  deadline?: string | null;
  labels?: string[];
  orden?: number;
  completed?: boolean;
  completed_at?: string | null;
  task_type?: TaskType | null;
  estimated_hours?: number | null;
  blocking_subtasks?: boolean;
  type_metadata?: Record<string, any> | null;
  parent_task_id?: string | null;
}

// Task with related data
export interface TaskWithDetails extends Task {
  assignee?: SistemaUser | null;
  project?: Project;
  column?: Column;
  subtasks?: Subtask[];
  comments?: CommentWithUser[];
  links?: TaskLink[];
}

// ============ SUBTASKS ============
export interface Subtask {
  id: string;
  task_id: string;
  titulo: string;
  completed: boolean;
  assignee_id: string | null;
  orden: number;
  created_at: string;
}

export interface SubtaskInsert {
  task_id: string;
  titulo: string;
  completed?: boolean;
  assignee_id?: string | null;
  orden?: number;
}

export interface SubtaskUpdate {
  titulo?: string;
  completed?: boolean;
  assignee_id?: string | null;
  orden?: number;
}

export interface SubtaskWithAssignee extends Subtask {
  assignee?: SistemaUser | null;
}

// ============ TASK LINKS ============
export interface TaskLink {
  id: string;
  task_id: string;
  url: string;
  titulo: string | null;
  created_at: string;
}

export interface TaskLinkInsert {
  task_id: string;
  url: string;
  titulo?: string | null;
}

// ============ COMMENTS ============
export interface Comment {
  id: string;
  task_id: string;
  user_id: string | null;
  author_name?: string | null;
  is_client?: boolean;
  source?: CommentSource | null;
  asset_id?: string | null;
  asset_version_id?: string | null;
  contenido: string;
  created_at: string;
  updated_at: string;
}

export type CommentSource = 'task_comment' | 'asset_feedback' | 'asset_status' | 'telegram_feedback';

export interface CommentInsert {
  task_id: string;
  user_id?: string | null;
  author_name?: string | null;
  is_client?: boolean;
  source?: CommentSource;
  asset_id?: string | null;
  asset_version_id?: string | null;
  contenido: string;
}

export interface CommentUpdate {
  contenido?: string;
}

export interface CommentWithUser extends Comment {
  user?: SistemaUser | null;
  asset?: { id: string; nombre: string } | null;
  asset_version?: { id: string; version_number: number } | null;
}

// ============ FAVORITES ============
export interface Favorite {
  id: string;
  user_id: string;
  project_id: string;
  created_at: string;
}

export interface FavoriteInsert {
  user_id: string;
  project_id: string;
}

// ============ PROJECT MEMBERS ============
export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: string;
}

export interface ProjectMemberInsert {
  project_id: string;
  user_id: string;
  role?: 'owner' | 'admin' | 'member' | 'viewer';
}

// ============ LABELS ============
export interface Label {
  id: string;
  project_id: string | null; // null = global label
  nombre: string;
  color: string;
  created_at: string;
}

export interface LabelInsert {
  project_id?: string | null;
  nombre: string;
  color?: string;
}

// ============ CONSTANTS ============
export const DEFAULT_COLUMNS: { nombre: string; orden: number }[] = [
  { nombre: 'PLANIFICACION', orden: 0 },
  { nombre: 'MATERIAL A PRODUCIR', orden: 1 },
  { nombre: 'EDICION', orden: 2 },
  { nombre: 'LISTO PARA PUBLICAR', orden: 3 },
];

export const PRIORITY_COLORS: Record<Priority, string> = {
  P1: '#dc2626', // red
  P2: '#f97316', // orange
  P3: '#eab308', // yellow
  P4: '#6b7280', // gray
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'Urgente',
  P2: 'Alta',
  P3: 'Media',
  P4: 'Baja',
};

export const PRIORITY_ORDER: Record<Priority, number> = {
  P1: 0,
  P2: 1,
  P3: 2,
  P4: 3,
};

export const PROJECT_COLORS = [
  '#dc4a3e', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#6b7280', // gray
] as const;

// ============ CALENDAR EVENTS ============
export type CalendarEventType = 'publicacion' | 'reunion' | 'deadline' | 'entrega' | 'otro';

export interface CalendarEvent {
  id: string;
  project_id: string;
  titulo: string;
  descripcion: string | null;
  tipo: CalendarEventType;
  fecha_inicio: string;
  fecha_fin: string | null;
  todo_el_dia: boolean;
  color: string;
  task_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventInsert {
  project_id: string;
  titulo: string;
  descripcion?: string | null;
  tipo?: CalendarEventType;
  fecha_inicio: string;
  fecha_fin?: string | null;
  todo_el_dia?: boolean;
  color?: string;
  task_id?: string | null;
  created_by: string;
}

export interface CalendarEventUpdate {
  titulo?: string;
  descripcion?: string | null;
  tipo?: CalendarEventType;
  fecha_inicio?: string;
  fecha_fin?: string | null;
  todo_el_dia?: boolean;
  color?: string;
  task_id?: string | null;
}

export interface CalendarEventWithProject extends CalendarEvent {
  project?: Project;
}

// ============ PROPOSALS ============
export type ProposalStatus = 'draft' | 'sent' | 'changes_requested' | 'accepted' | 'rejected';

export type ProposalCurrency = 'ARS' | 'USD' | 'EUR';

export interface Proposal {
  id: string;
  proposal_number: number | null;
  project_id: string | null;
  client_access_id: string | null;
  client_name: string | null;
  client_email: string | null;
  title: string;
  summary: string | null;
  currency: ProposalCurrency;
  status: ProposalStatus;
  public_token: string;
  total_amount: number;
  sent_at: string | null;
  changes_requested_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  auto_create_payment: boolean;
  accounting_payment_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalInsert {
  project_id?: string | null;
  client_access_id?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  title: string;
  summary?: string | null;
  currency?: ProposalCurrency;
  status?: ProposalStatus;
  total_amount?: number;
  auto_create_payment?: boolean;
  created_by?: string | null;
}

export interface ProposalUpdate {
  project_id?: string | null;
  client_access_id?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  title?: string;
  summary?: string | null;
  currency?: ProposalCurrency;
  status?: ProposalStatus;
  total_amount?: number;
  sent_at?: string | null;
  changes_requested_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  auto_create_payment?: boolean;
  accounting_payment_id?: string | null;
}

export interface ProposalSection {
  id: string;
  proposal_id: string;
  title: string;
  description: string | null;
  moodboard_links?: { label: string; url: string }[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalSectionInsert {
  proposal_id: string;
  title: string;
  description?: string | null;
  moodboard_links?: { label: string; url: string }[];
  position?: number;
}

export interface ProposalItem {
  id: string;
  proposal_id: string;
  section_id: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalItemInsert {
  proposal_id: string;
  section_id?: string | null;
  title: string;
  description?: string | null;
  quantity?: number;
  unit_price?: number;
  total_price?: number;
  position?: number;
}

export interface ProposalComment {
  id: string;
  proposal_id: string;
  author_name: string;
  content: string;
  is_client: boolean;
  created_at: string;
}

export interface ProposalWithDetails extends Proposal {
  project?: Project | null;
  sections?: ProposalSection[];
  items?: ProposalItem[];
  comments?: ProposalComment[];
}

// ============ PROPOSAL TEMPLATES ============
export interface ProposalTemplate {
  id: string;
  name: string;
  description: string | null;
  currency: ProposalCurrency;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProposalTemplateSection {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  moodboard_links?: { label: string; url: string }[];
  position: number;
  created_at: string;
  updated_at: string;
}

export interface ProposalTemplateItem {
  id: string;
  template_id: string;
  section_id: string | null;
  title: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  position: number;
  created_at: string;
  updated_at: string;
}

// ============ CRM / PIPELINE ============
export interface CrmStage {
  id: string;
  name: string;
  position: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmLead {
  id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  service_interest: string | null;
  estimated_budget: number | null;
  status_id: string | null;
  owner_id: string | null;
  notes: string | null;
  proposal_id: string | null;
  project_id: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmLeadInsert {
  company_name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_interest?: string | null;
  estimated_budget?: number | null;
  status_id?: string | null;
  owner_id?: string | null;
  notes?: string | null;
}

export interface CrmLeadUpdate {
  company_name?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_interest?: string | null;
  estimated_budget?: number | null;
  status_id?: string | null;
  owner_id?: string | null;
  notes?: string | null;
  proposal_id?: string | null;
  project_id?: string | null;
  last_contact_at?: string | null;
}

// ============ CLIENT ACCESS ============
export interface ClientAccess {
  id: string;
  project_id: string;
  email: string;
  nombre: string;
  access_token: string;
  can_view_calendar: boolean;
  can_view_tasks: boolean;
  can_comment: boolean;
  notify_asset_delivery: boolean;
  delivery_email: string | null;
  expires_at: string | null;
  last_accessed: string | null;
  created_at: string;
}

export interface ClientAccessInsert {
  project_id: string;
  email: string;
  nombre: string;
  can_view_calendar?: boolean;
  can_view_tasks?: boolean;
  can_comment?: boolean;
  notify_asset_delivery?: boolean;
  delivery_email?: string | null;
  expires_at?: string | null;
}

export interface ClientAccessUpdate {
  nombre?: string;
  email?: string;
  can_view_calendar?: boolean;
  can_view_tasks?: boolean;
  can_comment?: boolean;
  notify_asset_delivery?: boolean;
  delivery_email?: string | null;
  expires_at?: string | null;
}

// ============ ASSETS & APPROVALS ============
export type AssetType = 'single' | 'carousel' | 'reel';

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  single: 'Individual',
  carousel: 'Carrusel',
  reel: 'Reel',
};

export const ASSET_TYPE_ICONS: Record<AssetType, string> = {
  single: 'image',
  carousel: 'layers',
  reel: 'film',
};

export type ApprovalStatus = 'pending_review' | 'changes_requested' | 'approved_internal' | 'approved_final' | 'published';

export type FeedbackType =
  | 'correction_critical'
  | 'correction_minor'
  | 'aesthetic_preference'
  | 'doubt_question'
  | 'approval_love';

export interface Asset {
  id: string;
  task_id: string;
  project_id: string;
  nombre: string;
  descripcion: string | null;
  current_version: number;
  approval_status: ApprovalStatus;
  iteration_count: number;
  asset_type: AssetType;
  group_id: string | null;
  group_order: number;
  client_rating?: number;
  access_revoked?: boolean;
  access_revoked_at?: string | null;
  access_revoked_by?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AssetInsert {
  task_id: string;
  project_id: string;
  nombre: string;
  descripcion?: string | null;
  asset_type?: AssetType;
  group_id?: string | null;
  group_order?: number;
  created_by: string;
}

export interface AssetVersion {
  id: string;
  asset_id: string;
  version_number: number;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  thumbnail_url: string | null;
  preview_url?: string | null;
  storage_path?: string | null;
  thumbnail_path?: string | null;
  preview_path?: string | null;
  original_filename?: string | null;
  notified_at?: string | null;
  notified_by?: string | null;
  notes: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface AssetVersionInsert {
  asset_id: string;
  version_number: number;
  file_url: string;
  file_type?: string | null;
  file_size?: number | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  storage_path?: string | null;
  thumbnail_path?: string | null;
  preview_path?: string | null;
  original_filename?: string | null;
  notified_at?: string | null;
  notified_by?: string | null;
  notes?: string | null;
  uploaded_by: string;
}

export interface Annotation {
  id: string;
  asset_version_id: string;
  author_id: string | null;
  author_name: string | null;
  x_percent: number;
  y_percent: number;
  feedback_type: FeedbackType;
  contenido: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface AnnotationInsert {
  asset_version_id: string;
  author_id?: string | null;
  author_name?: string | null;
  x_percent: number;
  y_percent: number;
  feedback_type: FeedbackType;
  contenido: string;
}

export interface AnnotationWithAuthor extends Annotation {
  author?: SistemaUser | null;
  resolved_by_user?: SistemaUser | null;
}

export interface AssetWithVersions extends Asset {
  versions?: AssetVersion[];
  creator?: SistemaUser | null;
}

export interface ApprovalLogEntry {
  id: string;
  asset_id: string;
  from_status: ApprovalStatus | null;
  to_status: ApprovalStatus;
  changed_by: string;
  note: string | null;
  created_at: string;
  user?: SistemaUser | null;
}

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending_review: 'Pendiente revisión',
  changes_requested: 'Cambios solicitados',
  approved_internal: 'Aprobado interno',
  approved_final: 'Aprobado final',
  published: 'Publicado',
};

export const APPROVAL_STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending_review: '#f97316',
  changes_requested: '#dc2626',
  approved_internal: '#3b82f6',
  approved_final: '#22c55e',
  published: '#6b7280',
};

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  correction_critical: 'Corrección crítica',
  correction_minor: 'Corrección menor',
  aesthetic_preference: 'Preferencia estética',
  doubt_question: 'Duda / Pregunta',
  approval_love: 'Aprobación',
};

export const FEEDBACK_TYPE_COLORS: Record<FeedbackType, string> = {
  correction_critical: '#dc2626',
  correction_minor: '#f97316',
  aesthetic_preference: '#eab308',
  doubt_question: '#3b82f6',
  approval_love: '#22c55e',
};

export const EVENT_TYPE_COLORS: Record<CalendarEventType, string> = {
  publicacion: '#22c55e', // green
  reunion: '#3b82f6', // blue
  deadline: '#dc2626', // red
  entrega: '#f97316', // orange
  otro: '#6b7280', // gray
};

// ============ TASK DEPENDENCIES ============
export interface TaskDependency {
  id: string;
  task_id: string;
  depends_on_id: string;
  created_at: string;
}

// ============ USER ROLES ============
export interface UserRole {
  id: string;
  user_id: string;
  role: OrgRole;
  created_at: string;
}

// ============ PROJECT TEMPLATES ============
export interface ProjectTemplate {
  id: string;
  nombre: string;
  descripcion: string | null;
  created_by: string;
  structure: {
    columns: { name: string; order: number; wip_limit?: number }[];
    default_tasks?: {
      title: string;
      column_index: number;
      type?: TaskType;
      priority?: Priority;
      estimated_hours?: number;
      description?: string;
      social_copy?: string;
      link?: string;
      type_metadata?: Record<string, unknown> | null;
    }[];
  };
  created_at: string;
  updated_at: string;
}

export interface ProjectTemplateInsert {
  nombre: string;
  descripcion?: string | null;
  created_by: string;
  structure: ProjectTemplate['structure'];
}

// ============ TASK TYPE CONSTANTS ============
export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  diseno: 'Diseño',
  copy: 'Copy',
  video: 'Video',
  strategy: 'Estrategia',
  revision: 'Revisión',
  otro: 'Otro',
};

export const TASK_TYPE_COLORS: Record<TaskType, string> = {
  diseno: '#8b5cf6',
  copy: '#3b82f6',
  video: '#ec4899',
  strategy: '#f97316',
  revision: '#eab308',
  otro: '#6b7280',
};

// ============ AI PROMPT TEMPLATES ============
export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  prompt_text: string | null;
  industry: string | null;
  pillars: string | null;
  frequency: string | null;
  platforms: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplateInsert {
  name: string;
  prompt_text?: string | null;
  industry?: string | null;
  pillars?: string | null;
  frequency?: string | null;
  platforms?: string[] | null;
}

export const EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  publicacion: 'Publicación',
  reunion: 'Reunión',
  deadline: 'Deadline',
  entrega: 'Entrega',
  otro: 'Otro',
};

// ============ CLIENT BRIEFS ============
export interface ClientBrief {
  id: string;
  project_id: string;
  project_type: string;
  objectives: string | null;
  target_audience: string | null;
  tone_of_voice: string | null;
  references_text: string | null;
  budget: string | null;
  timeline: string | null;
  includes_ads: boolean;
  ad_budget: string | null;
  platforms: string[] | null;
  keep_existing_brand: boolean;
  existing_elements: string | null;
  content_frequency: string | null;
  key_messages: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientBriefInsert {
  project_id: string;
  project_type: string;
  objectives?: string | null;
  target_audience?: string | null;
  tone_of_voice?: string | null;
  references_text?: string | null;
  budget?: string | null;
  timeline?: string | null;
  includes_ads?: boolean;
  ad_budget?: string | null;
  platforms?: string[] | null;
  keep_existing_brand?: boolean;
  existing_elements?: string | null;
  content_frequency?: string | null;
  key_messages?: string | null;
}

export interface ClientBriefUpdate {
  project_type?: string;
  objectives?: string | null;
  target_audience?: string | null;
  tone_of_voice?: string | null;
  references_text?: string | null;
  budget?: string | null;
  timeline?: string | null;
  includes_ads?: boolean;
  ad_budget?: string | null;
  platforms?: string[] | null;
  keep_existing_brand?: boolean;
  existing_elements?: string | null;
  content_frequency?: string | null;
  key_messages?: string | null;
}

// ============ EFEMERIDES ============
export type EfemerideCategoria = 'patria' | 'comercial' | 'conmemorativa' | 'otro' | 'general';
export type EfemerideProyectoEstado = 'pendiente' | 'en_progreso' | 'lista' | 'publicada';

export interface Efemeride {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha_mes: number;
  fecha_dia: number;
  categoria: EfemerideCategoria;
  dias_anticipacion: number;
  recurrente: boolean;
  activa: boolean;
  global: boolean;
  project_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EfemerideInsert {
  nombre: string;
  descripcion?: string | null;
  fecha_mes: number;
  fecha_dia: number;
  categoria?: EfemerideCategoria;
  dias_anticipacion?: number;
  recurrente?: boolean;
  activa?: boolean;
  global?: boolean;
  project_id?: string | null;
  created_by?: string | null;
}

export interface EfemerideUpdate {
  nombre?: string;
  descripcion?: string | null;
  fecha_mes?: number;
  fecha_dia?: number;
  categoria?: EfemerideCategoria;
  dias_anticipacion?: number;
  recurrente?: boolean;
  activa?: boolean;
  global?: boolean;
  project_id?: string | null;
}

export interface EfemerideProyecto {
  id: string;
  efemeride_id: string;
  project_id: string;
  anio: number;
  estado: EfemerideProyectoEstado;
  asset_url: string | null;
  asset_storage_path: string | null;
  thumbnail_url: string | null;
  notas: string | null;
  calendar_event_id: string | null;
  task_id: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EfemerideProyectoInsert {
  efemeride_id: string;
  project_id: string;
  anio: number;
  estado?: EfemerideProyectoEstado;
  asset_url?: string | null;
  asset_storage_path?: string | null;
  thumbnail_url?: string | null;
  notas?: string | null;
  calendar_event_id?: string | null;
  task_id?: string | null;
  uploaded_by?: string | null;
}

export interface EfemerideProyectoUpdate {
  estado?: EfemerideProyectoEstado;
  asset_url?: string | null;
  asset_storage_path?: string | null;
  thumbnail_url?: string | null;
  notas?: string | null;
  calendar_event_id?: string | null;
  task_id?: string | null;
  uploaded_by?: string | null;
}

export interface EfemerideWithProyectos extends Efemeride {
  proyectos?: EfemerideProyecto[];
}

export const EFEMERIDE_CATEGORIA_LABELS: Record<EfemerideCategoria, string> = {
  patria: 'Patria',
  comercial: 'Comercial',
  conmemorativa: 'Conmemorativa',
  otro: 'Otro',
  general: 'General',
};

export const EFEMERIDE_CATEGORIA_COLORS: Record<EfemerideCategoria, string> = {
  patria: '#3b82f6',
  comercial: '#22c55e',
  conmemorativa: '#f97316',
  otro: '#6b7280',
  general: '#8b5cf6',
};

export const EFEMERIDE_ESTADO_LABELS: Record<EfemerideProyectoEstado, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En progreso',
  lista: 'Lista',
  publicada: 'Publicada',
};

export const EFEMERIDE_ESTADO_COLORS: Record<EfemerideProyectoEstado, string> = {
  pendiente: '#dc2626',
  en_progreso: '#eab308',
  lista: '#22c55e',
  publicada: '#6b7280',
};
