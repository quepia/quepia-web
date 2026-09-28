import { notFound } from 'next/navigation'
import { getSocialAdminOrNull } from '@/lib/social/auth'
import { MonthlyBackupsView } from '@/components/sistema/quepia/monthly-backups-view'

export const dynamic = 'force-dynamic'

export default async function MonthlyBackupsPage() {
  if (!(await getSocialAdminOrNull())) notFound()
  return (
    <main className="min-h-screen bg-[#0a0a0a]">
      <MonthlyBackupsView />
    </main>
  )
}
