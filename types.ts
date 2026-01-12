export interface Project {
  id: number;
  title: string;
  category: 'Video' | 'Fotografía' | 'Diseño' | 'Branding';
  image: string;
  description: string;
}

export interface Service {
  id: number;
  title: string;
  description: string;
  icon: string;
  category: 'Producción' | 'Fotografía' | 'Diseño';
}

export interface NavigationItem {
  name: string;
  path: string;
}