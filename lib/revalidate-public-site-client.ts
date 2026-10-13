"use client"

import { revalidatePublicSite } from "@/lib/actions/revalidate-public-site"

/** A cache failure must never make a successful database save look unsuccessful. */
export async function refreshPublicSiteAfterSave() {
  try {
    await revalidatePublicSite()
  } catch (error) {
    console.error("[PublicSite] Saved, but revalidation failed", error)
    alert("Los cambios se guardaron. La actualización de la web pública quedó pendiente; se renovará en la próxima revalidación automática.")
  }
}
