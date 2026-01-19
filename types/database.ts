// Database types for Supabase tables

export interface Proyecto {
  id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  imagen_url: string | null;
  destacado: boolean;
  fecha_creacion: string;
  orden: number;
}

export interface ProyectoInsert {
  titulo: string;
  descripcion?: string | null;
  categoria: string;
  imagen_url?: string | null;
  destacado?: boolean;
  orden?: number;
}

export interface ProyectoUpdate {
  titulo?: string;
  descripcion?: string | null;
  categoria?: string;
  imagen_url?: string | null;
  destacado?: boolean;
  orden?: number;
}

export interface Servicio {
  id: string;
  titulo: string;
  descripcion_corta: string;
  descripcion: string;
  icono: string;
  categoria_trabajo: string | null;
  features: string[];
  orden: number;
}

export interface ServicioInsert {
  titulo: string;
  descripcion_corta: string;
  descripcion: string;
  icono: string;
  categoria_trabajo?: string | null;
  features?: string[];
  orden?: number;
}

export interface ServicioUpdate {
  titulo?: string;
  descripcion_corta?: string;
  descripcion?: string;
  icono?: string;
  categoria_trabajo?: string | null;
  features?: string[];
  orden?: number;
}

export interface AuthorizedUser {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthorizedUserInsert {
  email: string;
}

export interface AuthorizedUserUpdate {
  email?: string;
}

export interface Configuracion {
  id: string;
  clave: string;
  valor: string;
  descripcion: string | null;
  tipo: 'text' | 'email' | 'url' | 'textarea' | 'json';
  categoria: string;
  orden: number;
  fecha_actualizacion: string;
}

export interface ConfiguracionUpdate {
  valor: string;
}

export interface Equipo {
  id: string;
  nombre: string;
  rol: string;
  bio: string | null;
  imagen_url: string | null;
  instagram: string | null;
  linkedin: string | null;
  email: string | null;
  orden: number;
  activo: boolean;
  fecha_creacion: string;
}

export interface EquipoInsert {
  nombre: string;
  rol: string;
  bio?: string | null;
  imagen_url?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  email?: string | null;
  orden?: number;
  activo?: boolean;
}

export interface EquipoUpdate {
  nombre?: string;
  rol?: string;
  bio?: string | null;
  imagen_url?: string | null;
  instagram?: string | null;
  linkedin?: string | null;
  email?: string | null;
  orden?: number;
  activo?: boolean;
}

// Category type for filtering
export type WorkCategory =
  | 'branding'
  | 'diseno-grafico'
  | 'fotografia'
  | 'video'
  | 'redes-sociales'
  | 'packaging'
  | 'carteleria'
  | 'marketing'
  | 'productos';

export const CATEGORIES: { id: WorkCategory; label: string }[] = [
  { id: 'branding', label: 'Branding' },
  { id: 'diseno-grafico', label: 'Diseño Gráfico' },
  { id: 'fotografia', label: 'Fotografía' },
  { id: 'video', label: 'Video' },
  { id: 'redes-sociales', label: 'Redes Sociales' },
  { id: 'packaging', label: 'Packaging' },
  { id: 'carteleria', label: 'Cartelería' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'productos', label: 'Productos' },
];

// Icon names for services
export const SERVICE_ICONS = [
  'Palette',
  'Layout',
  'Megaphone',
  'Layers',
  'PenTool',
  'Video',
  'Camera',
  'Package',
  'Image',
] as const;

export type ServiceIcon = typeof SERVICE_ICONS[number];

// Config categories for admin
export const CONFIG_CATEGORIES = [
  { id: 'contacto', label: 'Información de Contacto' },
  { id: 'horarios', label: 'Horarios' },
  { id: 'redes', label: 'Redes Sociales' },
  { id: 'empresa', label: 'Información de la Empresa' },
  { id: 'textos', label: 'Textos Personalizables' },
] as const;
