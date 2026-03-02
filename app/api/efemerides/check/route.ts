import { NextResponse } from "next/server"
import { checkEfemeridesNotificaciones } from "@/lib/sistema/actions/efemerides"

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured.
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const result = await checkEfemeridesNotificaciones()
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (error) {
    console.error("Error in /api/efemerides/check:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    )
  }
}
