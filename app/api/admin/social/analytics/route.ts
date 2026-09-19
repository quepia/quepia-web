import { adminRoute, paramsFromUrl, socialQuery } from "@/lib/social/server"
import { SocialError } from "@/lib/social/errors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const OPS = new Set(["timeseries", "compare_periods", "compare_formats", "coverage", "attention", "definitions", "scopes"])

export const GET = adminRoute(async ({ request, admin }) => {
  const op = new URL(request.url).searchParams.get("op") || "timeseries"
  if (!OPS.has(op)) throw new SocialError(400, "unknown_operation", "Operación no permitida")
  return socialQuery(admin, op, paramsFromUrl(request))
})
