import { Suspense } from "react"
import { notFound } from "next/navigation"
import { getSocialAdminOrNull } from "@/lib/social/auth"
import { SocialModule } from "@/components/sistema/social/social-module"

export const dynamic = "force-dynamic"

// Acceso directo al módulo. Solo administradores globales activos y
// autorizados; cualquier otra identidad recibe la página 404 (no se revela el
// módulo). Por el loading.tsx de /sistema la respuesta se transmite en
// streaming, de modo que el estado HTTP puede ser 200 con la UI 404.
export default async function SocialPage() {
  const admin = await getSocialAdminOrNull()
  if (!admin) notFound()
  return (
    <main className="flex min-h-screen flex-col bg-[#0a0a0a]">
      <Suspense>
        <SocialModule />
      </Suspense>
    </main>
  )
}
