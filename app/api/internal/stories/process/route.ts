import { NextResponse } from "next/server"
import { processStoryQueue } from "@/lib/ai/story-generation"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  try {
    const processed = await processStoryQueue()
    return NextResponse.json({ processed })
  } catch { return NextResponse.json({ error: "No se pudo procesar la cola" }, { status: 500 }) }
}
