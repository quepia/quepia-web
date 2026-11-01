import { adminRoute } from "@/lib/social/server"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Compatibilidad con pestañas antiguas: ya no hay permisos sociales por conexión.
export const GET = adminRoute(async () => [])
export const POST = adminRoute(async () => NextResponse.json({
  error: "La analítica MCP se habilita automáticamente para administradores globales.",
}, { status: 410 }))
