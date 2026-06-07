import { NextResponse } from "next/server"
import { processDueScheduledClientNotifications } from "@/lib/sistema/actions/notifications"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret) {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET is not configured" },
        { status: 500 }
      )
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(request.url)
    const limit = Number(url.searchParams.get("limit") || "10")
    const result = await processDueScheduledClientNotifications({ limit })

    return NextResponse.json(result, { status: result.success ? 200 : 207 })
  } catch (error) {
    console.error("Error in /api/client-notifications/process:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 }
    )
  }
}
