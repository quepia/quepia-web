import { NextResponse } from 'next/server'
import { requireSocialAdmin } from '@/lib/social/auth'
import { SocialError } from '@/lib/social/errors'
import {
  discoverMonthlyBackups,
  getMonthlyBackupOverview,
  processMonthlyBackups,
} from '@/lib/sistema/monthly-backups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300
const headers = { 'Cache-Control': 'no-store' }

export async function GET(request: Request) {
  try {
    await requireSocialAdmin(request)
    await discoverMonthlyBackups()
    return NextResponse.json(await getMonthlyBackupOverview(), { headers })
  } catch (error) {
    const status = error instanceof SocialError ? error.status : 500
    const body = {
      error:
        error instanceof SocialError
          ? error.message
          : 'No se pudo completar la operación de backups. Intentá nuevamente.',
    }
    if (status === 500) console.error('[MonthlyBackups]', error)
    return NextResponse.json(body, { status, headers })
  }
}

export async function POST(request: Request) {
  try {
    await requireSocialAdmin(request)
    const body = await request.json().catch(() => ({}))
    const result = await processMonthlyBackups({
      retryErrors: body?.retryErrors === true,
    })
    return NextResponse.json(result, { headers })
  } catch (error) {
    const status = error instanceof SocialError ? error.status : 500
    const body = {
      error:
        error instanceof SocialError
          ? error.message
          : 'No se pudo completar la operación de backups. Intentá nuevamente.',
    }
    if (status === 500) console.error('[MonthlyBackups]', error)
    return NextResponse.json(body, { status, headers })
  }
}
