import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { processMonthlyBackups } from '@/lib/sistema/monthly-backups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization') || ''
  const match = expected ? Buffer.from(`Bearer ${expected}`) : null
  if (
    !match ||
    Buffer.byteLength(supplied) !== match.length ||
    !timingSafeEqual(Buffer.from(supplied), match)
  ) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  try {
    const result = await processMonthlyBackups({ maxFiles: 100 })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[MonthlyBackups]', error)
    return NextResponse.json(
      {
        error:
          'No se pudo completar el respaldo. Se reintentará en la próxima ejecución.',
      },
      { status: 500 },
    )
  }
}
