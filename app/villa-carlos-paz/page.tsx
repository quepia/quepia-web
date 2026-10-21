import LocationPage from '@/components/seo/LocationPage';
import { localMetadata } from '@/lib/seo/local-search';
export const revalidate = 300;
// El H1 conserva el título de landing-pages; el title de búsqueda suma «agencia de comunicación» (SEO-30).
export const metadata = localMetadata('villa-carlos-paz', 'Consultora creativa y agencia de comunicación en Villa Carlos Paz');
export default function Page() { return <LocationPage slug="villa-carlos-paz" />; }
