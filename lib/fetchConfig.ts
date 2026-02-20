import { createClient } from '@/lib/supabase/client';
import { Configuracion, Equipo } from '@/types/database';

// Site config type
export interface SiteConfig {
    email_contacto?: string;
    telefono?: string;
    whatsapp?: string;
    instagram?: string;
    linkedin?: string;
    behance?: string;
    facebook?: string;
    youtube?: string;
    tiktok?: string;
    twitter?: string;
    google_maps?: string;
    google_business?: string;
    direccion?: string;
    horario_dias?: string;
    horario_horas?: string;
    horario_extra?: string;
    [key: string]: string | undefined;
}

// Helper to convert config array to key-value object
export const formatConfig = (config: Configuracion[]): SiteConfig => {
    const formatted: SiteConfig = {};
    config.forEach((item) => {
        formatted[item.clave] = item.valor;
    });
    return formatted;
};

export const getSiteConfig = async (): Promise<SiteConfig> => {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('configuracion')
        .select('*');

    if (error) {
        console.error('Error fetching config:', error);
        return {};
    }

    return formatConfig(data || []);
};

export const getTeamMembers = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
        .from('equipo')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

    if (error) {
        console.error('Error fetching team:', error);
        return [];
    }

    return data as Equipo[];
};
