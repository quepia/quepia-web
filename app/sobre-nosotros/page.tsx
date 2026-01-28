import { getTeamMembersServer } from '@/lib/fetchConfigServer';
import AboutClient from '@/components/about/AboutClient';

export const metadata = {
    title: 'Sobre Nosotros',
    description: 'Conocé al equipo de Quepia. Somos una consultora creativa de Villa Carlos Paz, Córdoba, apasionada por transformar marcas en experiencias visuales memorables.',
};

export default async function AboutPage() {
    const team = await getTeamMembersServer();

    return (
        <AboutClient team={team} />
    );
}
