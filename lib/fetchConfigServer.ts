import { createPublicClient } from '@/lib/supabase/public';
import { Configuracion, Equipo, Proyecto } from '@/types/database';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

// Helper to convert config array to key-value object
export const formatConfig = (config: Pick<Configuracion, 'clave' | 'valor'>[]) => {
    const formatted: Record<string, string> = {};
    config.forEach((item) => {
        formatted[item.clave] = item.valor;
    });
    return formatted;
};

// Only anonymous, public configuration belongs in this shared cache. Throwing
// on failure keeps a transient outage from replacing a successful cache entry.
const getCachedSiteConfig = unstable_cache(async () => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
        .from('configuracion')
        .select('clave, valor')
        .abortSignal(AbortSignal.timeout(2_000));

    if (error) throw error;
    return formatConfig(data || []);
}, ['public-site-config-v1'], { revalidate: 3600, tags: ["public-site-config"] });

// Deduplicate the layout and page reads in the same render, including errors.
export const getSiteConfigServer = cache(async (): Promise<Record<string, string>> => {
    try {
        return await getCachedSiteConfig();
    } catch (error) {
        console.error('Error in getSiteConfigServer:', error);
        return {};
    }
});

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

// /trabajos keeps its query-string filter and ordering; share only anonymous data.
export const getPortfolioProjectsServer = unstable_cache(async (): Promise<Proyecto[]> => {
    const { data, error } = await createPublicClient()
        .from('proyectos')
        .select('*')
        .order('orden', { ascending: true })
        .order('fecha_creacion', { ascending: false });
    if (error) throw error;
    return data || [];
}, ['public-portfolio-projects-v1'], { revalidate: 3600, tags: ['public-portfolio-projects'] });
