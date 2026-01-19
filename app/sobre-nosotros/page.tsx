import { getTeamMembersServer } from '@/lib/fetchConfigServer';
import AboutClient from '@/components/about/AboutClient';

export default async function AboutPage() {
    const team = await getTeamMembersServer();

    return (
        <AboutClient team={team} />
    );
}
