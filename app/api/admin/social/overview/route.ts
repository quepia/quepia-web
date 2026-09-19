import { adminRoute, paramsFromUrl, socialQuery } from "@/lib/social/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export const GET = adminRoute(async ({ request, admin }) => socialQuery(admin, "overview", paramsFromUrl(request)))
