import LocationPage from '@/components/seo/LocationPage';
import { locations } from '@/lib/seo/landing-pages';
const item = locations.find(item => item.slug === 'cordoba')!;
export const revalidate = 300;
export const metadata = { title: item.title, description: item.sections[0].text.slice(0, 155), alternates: { canonical: '/cordoba' } };
export default function Page() { return <LocationPage slug="cordoba" />; }
