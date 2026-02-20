import type { Metadata } from 'next';
import DashboardClient from './dashboard-client'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Sistema | Quepia',
    robots: { index: false, follow: false },
};

export default function Page() {
    return <DashboardClient />
}
