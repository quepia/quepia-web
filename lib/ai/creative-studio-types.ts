import type { ClientBrief } from "@/types/sistema"

export type CreativeModelTarget = "general" | "chatgpt" | "midjourney" | "imagen" | "firefly"
export type CreativePromptLanguage = "en" | "es"
export type CreativeProductionMode = "photo-with-overlay" | "visual-only"

export interface CreativePieceContext {
  deliverableType: string
  platform: string
  format: string
  objective: string
  visualRequest: string
  headlineText: string
  referenceNotes: string
  campaignExceptions: string
  productionMode: CreativeProductionMode
  modelTarget: CreativeModelTarget
  promptLanguage: CreativePromptLanguage
}

export interface CreativeInlineReference {
  id: string
  name: string
  mediaType: "image/jpeg" | "image/png" | "image/webp"
  dataUrl: string
}

export interface CreativeDirection {
  id: string
  title: string
  concept: string
  socialHook: string
  headline: string
  imagePlan: string
  visualMetaphor: string
  composition: string
  mobileRead: string
  styleMood: string
  brandConnection: string
  risk: string
}

export interface CreativeDirectionsResult {
  directions: CreativeDirection[]
  contextGaps: string[]
  assumptions: string[]
}

export interface CreativePromptPack {
  title: string
  rationale: string
  visualPrompt: string
  brandRules: string
  negativePrompt: string
  layoutNotes: string
  exactCopy: string
  captionBoundary: string
  technicalSettings: string
  variations: string[]
  publishabilityChecklist: string[]
}

export interface CreativeReviewScores {
  brandConsistency: number
  taskAlignment: number
  socialPublishability: number
  mobileLegibility: number
  visualAuthenticity: number
}

export interface CreativeReview {
  verdict: "publishable" | "needs-work" | "reject"
  summary: string
  scores: CreativeReviewScores
  strengths: string[]
  issues: string[]
  correctionPrompt: string
  layoutCorrection: string
  nextSteps: string[]
}

export interface CreativeStudioDraft {
  taskId: string
  pieceContext: CreativePieceContext
  directionsResult: CreativeDirectionsResult | null
  selectedDirectionId: string
  promptPack: CreativePromptPack | null
  review: CreativeReview | null
  referenceAssetIds: string[]
  reviewAssetIds: string[]
  inlineReferences: CreativeInlineReference[]
  activeStep: "context" | "directions" | "prompt" | "review"
  updatedAt: string
}

export interface CreativeStudioAsset {
  id: string
  versionId: string
  name: string
  filename: string
  assetType: "single" | "carousel" | "reel" | "folder"
  groupId: string | null
  groupOrder: number
  fileType: string
  analysisStatus: "ready" | "pending"
}

export interface CreativeStudioTask {
  id: string
  projectId: string
  projectName: string
  title: string
  description: string
  socialCopy: string
  taskType: string
  labels: string[]
  typeMetadata: Record<string, unknown>
}

export interface CreativePromptVersion {
  id: string
  task_id: string
  project_id: string
  created_by: string
  version_number: number
  piece_context: CreativePieceContext
  directions: CreativeDirection[]
  selected_direction: CreativeDirection | null
  prompt_pack: CreativePromptPack
  review: CreativeReview | null
  source_asset_ids: string[]
  created_at: string
}

export interface CreativeStudioContextResponse {
  task: CreativeStudioTask
  brief: ClientBrief | null
  briefCoverage: {
    completed: number
    total: number
    missing: string[]
  }
  assets: CreativeStudioAsset[]
  versions: CreativePromptVersion[]
  persistenceAvailable: boolean
}

export const EMPTY_CREATIVE_PIECE_CONTEXT: CreativePieceContext = {
  deliverableType: "",
  platform: "",
  format: "",
  objective: "",
  visualRequest: "",
  headlineText: "",
  referenceNotes: "",
  campaignExceptions: "",
  productionMode: "photo-with-overlay",
  modelTarget: "general",
  promptLanguage: "en",
}
