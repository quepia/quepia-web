import WorksClient from './works-client';
import { createPublicClient } from '@/lib/supabase/public';
import { CATEGORIES } from '@/types/database';

export const revalidate = 60;

interface TrabajosPageProps {
    searchParams?: Promise<{ category?: string }>;
}

export default async function Page({ searchParams }: TrabajosPageProps) {
    const params = await searchParams;
    const requestedCategory = params?.category ?? 'branding';
    const validCategory = CATEGORIES.find((category) => category.id === requestedCategory)?.id ?? CATEGORIES[0]?.id ?? 'branding';

    const supabase = createPublicClient();
    const { data: proyectos } = await supabase
        .from('proyectos')
        .select('*')
        .eq('categoria', validCategory)
        .order('orden', { ascending: true })
        .order('fecha_creacion', { ascending: false });

    return (
        <WorksClient
            proyectos={proyectos || []}
            activeCategory={validCategory}
        />
    );
}
