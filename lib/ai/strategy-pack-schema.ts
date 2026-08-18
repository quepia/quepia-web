import { z } from "zod/v4"

export const strategyNarrativeSectionSchema = z.object({
  title: z.string().max(200),
  summary: z.string().max(2_000),
  points: z.array(z.string().max(700)).min(1).max(10),
  evidenceUrls: z.array(z.string().max(2_048)).max(10),
})

export const strategyNarrativeDocumentSchema = z.object({
  executiveSummary: z.string().max(5_000),
  confidence: z.number().int().min(0).max(100),
  sections: z.array(strategyNarrativeSectionSchema).min(3).max(8),
  nextActions: z.array(z.string().max(700)).min(2).max(10),
  limitations: z.array(z.string().max(700)).max(10),
})

export const strategyPackSchema = z.object({
  productInformation: strategyNarrativeDocumentSchema,
  marketingStrategy: strategyNarrativeDocumentSchema,
  brandVoice: strategyNarrativeDocumentSchema,
  contentStrategy: strategyNarrativeDocumentSchema,
})

export type StrategyPackOutput = z.infer<typeof strategyPackSchema>
