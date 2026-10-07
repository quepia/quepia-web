import LocationPage from '@/components/seo/LocationPage';
import { locations } from '@/lib/seo/landing-pages';
import { localMetadata } from '@/lib/seo/local-search';
const item = locations.find(item => item.slug === 'cordoba')!;
export const revalidate = 300;
export const metadata = localMetadata('cordoba', item.title);
export default function Page() { return <LocationPage slug="cordoba" />; }
