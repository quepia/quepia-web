import LocationPage from '@/components/seo/LocationPage';
import { locations } from '@/lib/seo/landing-pages';
import { localMetadata } from '@/lib/seo/local-search';
const item = locations.find(item => item.slug === 'villa-carlos-paz')!;
export const revalidate = 300;
export const metadata = localMetadata('villa-carlos-paz', item.title);
export default function Page() { return <LocationPage slug="villa-carlos-paz" />; }
