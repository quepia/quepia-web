import { createPublicClient } from '@/lib/supabase/public';
import { Configuracion, Equipo } from '@/types/database';

// Helper to convert config array to key-value object
export const formatConfig = (config: Configuracion[]) => {
    const formatted: Record<string, string> = {};
    config.forEach((item) => {
        formatted[item.clave] = item.valor;
    });
    return formatted;
};

export const getSiteConfigServer = async () => {
    try {
        const supabase = createPublicClient();
        const { data, error } = await supabase
            .from('configuracion')
            .select('*');

        if (error) {
            console.error('Error fetching config (server):', error);
            return {};
        }

        return formatConfig(data || []);
    } catch (error) {
        console.error('Error in getSiteConfigServer:', error);
        return {};
    }
};

export const getTeamMembersServer = async () => {
    try {
        const supabase = createPublicClient();
        const { data, error } = await supabase
            .from('equipo')
            .select('*')
            .eq('activo', true)
            .order('orden', { ascending: true });

        if (error) {
            console.error('Error fetching team (server):', error);
            return [];
        }

        return data as Equipo[];
    } catch (error) {
        console.error('Error in getTeamMembersServer:', error);
        return [];
    }
};
