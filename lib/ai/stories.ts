import { z } from "zod"

export const STORY_FORMATS = {
  story: { label: "Historia · 9:16", size: "1152x2048", width: 1080, height: 1920 },
  portrait: { label: "Feed · 4:5", size: "1024x1280", width: 1080, height: 1350 },
  square: { label: "Cuadrado · 1:1", size: "1024x1024", width: 1080, height: 1080 },
} as const

export const storySettingsSchema = z.object({
  request: z.string().trim().max(4000).default(""),
  prompt: z.string().trim().max(16000).default(""),
  headline: z.string().trim().max(120).default(""),
  cta: z.string().trim().max(70).default(""),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).default(""),
  format: z.enum(["story", "portrait", "square"]).default("story"),
  quality: z.enum(["low", "medium", "high"]).default("high"),
  mode: z.enum(["creative", "faithful"]).default("creative"),
  referenceAssetIds: z.array(z.string().uuid()).max(4).default([]),
  rules: z.string().trim().max(3000).default(""),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ffffff"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111111"),
  headlinePosition: z.enum(["top", "bottom"]).default("bottom"),
  includeLogo: z.boolean().default(true),
})
export type StorySettings = z.infer<typeof storySettingsSchema>
export const EMPTY_STORY = storySettingsSchema.parse({})
export type StoryJobStatus = "queued" | "running" | "succeeded" | "failed" | "needs_attention" | "cancelled"
export interface StoryJob {
  id: string
  task_id: string
  status: StoryJobStatus
  asset_id: string | null
  previewUrl?: string | null
  cost_usd: number | null
  reserved_usd: number
  error_message: string | null
  created_at: string
  settings: StorySettings
}
export const STORY_JOB_LABELS: Record<StoryJobStatus, string> = {
  queued: "En cola", running: "Generando", succeeded: "Para revisar", failed: "Falló",
  needs_attention: "Requiere revisión", cancelled: "Cancelada",
}
export function readStorySettings(metadata: unknown): StorySettings {
  const result = storySettingsSchema.safeParse((metadata as { story?: unknown } | null)?.story)
  return result.success ? result.data : { ...EMPTY_STORY, referenceAssetIds: [] }
}

// Conservative reservation, not a provider quote or a guaranteed maximum.
export function storyReservation(settings: StorySettings) {
  if (settings.mode === "faithful") return 0
  return settings.quality === "high" ? 1 : settings.quality === "medium" ? 0.5 : 0.2
}

export function imageUsageCost(usage: unknown): number | null {
  if (!usage || typeof usage !== "object") return null
  const value = usage as { input_tokens_details?: { text_tokens?: number; image_tokens?: number }; output_tokens?: number }
  const text = value.input_tokens_details?.text_tokens
  const image = value.input_tokens_details?.image_tokens
  const output = value.output_tokens
  if (![text, image, output].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0)) return null
  // Standard uncached token rates; conservative when the provider applies caching.
  return Number(((text! * 5 + image! * 8 + output! * 30) / 1_000_000).toFixed(6))
}

export function storyBasePrompt(settings: StorySettings, brand: string) {
  return [brand, settings.prompt || settings.request, settings.rules,
    "Produce one clean base image. No readable text, typography, logos, watermarks or graphic overlays. These are added separately.",
    "Preserve the real identity, proportions and distinctive details of referenced people, products and places. Do not invent commercial facts or facilities.",
    "Avoid plastic skin, malformed anatomy, impossible architecture, excessive HDR, generic stock-photo posing and arbitrary decorative effects.",
    settings.headline ? `Leave clear negative space at the ${settings.headlinePosition} for later typesetting.` : "",
  ].filter(Boolean).join("\n\n")
}
