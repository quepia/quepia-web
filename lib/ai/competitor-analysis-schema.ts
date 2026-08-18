import { z } from "zod/v4"

export const competitorAnalysisSchema = z.object({
  executiveSummary: z.string().max(5_000),
  marketPosition: z.string().max(3_000),
  clientStrengths: z.array(z.string().max(500)).max(8),
  clientRisks: z.array(z.string().max(500)).max(8),
  competitors: z.array(z.object({
    competitorId: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    website: z.string().max(2_048),
    category: z.enum(["direct", "indirect", "local", "aspirational"]),
    positioning: z.string().max(2_000),
    targetAudience: z.string().max(1_500),
    offer: z.string().max(2_000),
    pricing: z.string().max(1_000),
    channels: z.array(z.string().max(200)).max(12),
    strengths: z.array(z.string().max(500)).max(8),
    weaknesses: z.array(z.string().max(500)).max(8),
    contentPatterns: z.array(z.string().max(500)).max(8),
    differentiators: z.array(z.string().max(500)).max(8),
    evidenceUrls: z.array(z.string().max(2_048)).max(12),
    confidence: z.number().int().min(0).max(100),
  })).min(1).max(8),
  comparisonDimensions: z.array(z.object({
    label: z.string().max(200),
    clientValue: z.string().max(1_000),
    competitorValues: z.array(z.object({
      competitorId: z.string().max(100),
      value: z.string().max(1_000),
    })).max(8),
  })).max(10),
  opportunities: z.array(z.object({
    title: z.string().max(240),
    description: z.string().max(3_000),
    impact: z.enum(["high", "medium", "low"]),
    effort: z.enum(["high", "medium", "low"]),
    confidence: z.number().int().min(0).max(100),
    evidenceUrls: z.array(z.string().max(2_048)).max(10),
    suggestedTask: z.string().max(500),
  })).min(1).max(12),
  recommendedActions: z.array(z.string().max(700)).max(10),
  limitations: z.array(z.string().max(700)).max(10),
})

export type CompetitorAnalysisOutput = z.infer<typeof competitorAnalysisSchema>
