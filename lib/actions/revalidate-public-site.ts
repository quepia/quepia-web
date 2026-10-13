"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { requireSocialAdmin } from "@/lib/social/auth"

export async function revalidatePublicSite() {
  await requireSocialAdmin()
  revalidateTag("public-site-config")
  revalidateTag("public-seo-projects")
  revalidateTag("public-portfolio-projects")
  for (const path of ["/", "/trabajos", "/servicios", "/sobre-nosotros", "/sitemap.xml"]) revalidatePath(path)
  revalidatePath("/trabajos/[slug]", "page")
  revalidatePath("/servicios/[slug]", "page")
  revalidatePath("/rubros/[slug]", "page")
}
