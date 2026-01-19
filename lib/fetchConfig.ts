import { createClient } from '@/lib/supabase/client';
import { Configuracion, Equipo } from '@/types/database';

// Helper to convert config array to key-value object
export const formatConfig = (config: Configuracion[]) => {
    const formatted: Record<string, string> = {};
    config.forEach((item) => {
        formatted[item.clave] = item.valor;
    });
    return formatted;
};

export const getSiteConfig = async () => {
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
