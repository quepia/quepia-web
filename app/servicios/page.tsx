import { createPublicClient } from '@/lib/supabase/public';
import ServiciosClient from './ServiciosClient';

export const revalidate = 60;

export default async function ServiciosPage() {
    const supabase = createPublicClient();
    const { data: servicios } = await supabase
        .from('servicios')
        .select('*')
        .order('orden', { ascending: true });

    return <ServiciosClient servicios={servicios || []} />;
}
