import { NextRequest, NextResponse } from 'next/server'
import { checkEfemeridesNotificaciones } from '@/lib/sistema/actions/efemerides'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkEfemeridesNotificaciones()

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  })
}
