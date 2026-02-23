import {
  Camera,
  Layout,
  Layers,
  Megaphone,
  Package,
  Palette,
  PenTool,
  Video,
  type LucideIcon,
} from 'lucide-react';

export const SERVICE_ICON_MAP: Record<string, LucideIcon> = {
  Palette,
  Layers,
  Megaphone,
  Video,
  Camera,
  Package,
  PenTool,
  Layout,
};

export function getServiceIconByName(iconName: string): LucideIcon | null {
  return SERVICE_ICON_MAP[iconName] ?? null;
}
