import type { Metadata } from 'next';
import DashboardBoot from './dashboard-boot'

export const metadata: Metadata = {
    title: 'Sistema | Quepia',
    robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic'

export default function Page() {
    return <DashboardBoot />
}
