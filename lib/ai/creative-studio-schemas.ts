import "server-only"

import { jsonSchema } from "ai"
import type {
  CreativeDirectionsResult,
  CreativePromptPack,
  CreativeReview,
} from "@/lib/ai/creative-studio-types"

export const creativeDirectionsSchema = jsonSchema<CreativeDirectionsResult>({
  type: "object",
  additionalProperties: false,
  required: ["directions", "contextGaps", "assumptions"],
  properties: {
    directions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "concept", "socialHook", "headline", "imagePlan", "visualMetaphor", "composition", "mobileRead", "styleMood", "brandConnection", "risk"],
        properties: {
          id: { type: "string", description: "Identificador corto y estable: direction-1, direction-2 o direction-3." },
          title: { type: "string" },
          concept: { type: "string" },
          socialHook: { type: "string", description: "Por qué alguien se detendría a mirar esta pieza en redes." },
          headline: { type: "string", description: "Titular breve sugerido para diseño, idealmente entre 3 y 10 palabras. Nunca el caption completo." },
          imagePlan: { type: "string", description: "Qué fotografía o imagen base producir, con sujeto, acción, entorno y señales de autenticidad." },
          visualMetaphor: { type: "string" },
          composition: { type: "string" },
          mobileRead: { type: "string", description: "Jerarquía y lectura de la pieza en una pantalla móvil." },
          styleMood: { type: "string" },
          brandConnection: { type: "string" },
          risk: { type: "string" },
        },
      },
    },
    contextGaps: { type: "array", items: { type: "string" }, maxItems: 5 },
    assumptions: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
})

export const creativePromptPackSchema = jsonSchema<CreativePromptPack>({
  type: "object",
  additionalProperties: false,
  required: ["title", "rationale", "visualPrompt", "brandRules", "negativePrompt", "layoutNotes", "exactCopy", "captionBoundary", "technicalSettings", "variations", "publishabilityChecklist"],
  properties: {
    title: { type: "string" },
    rationale: { type: "string" },
    visualPrompt: { type: "string", description: "Prompt listo para generar únicamente la imagen base: sin texto, tipografía, hashtags, logo, marcos ni placa gráfica." },
    brandRules: { type: "string", description: "Reglas de marca compactas que el resultado debe respetar." },
    negativePrompt: { type: "string", description: "Elementos, errores y estilos que deben evitarse." },
    layoutNotes: { type: "string", description: "Plan de diseño posterior: jerarquía, zona del titular, márgenes seguros y lectura móvil." },
    exactCopy: { type: "string", description: "Solo el titular breve que el diseñador agregará después. Nunca caption, CTA largo, emojis o hashtags." },
    captionBoundary: { type: "string", description: "Indicación explícita de qué copy queda fuera de la imagen y se publica como caption." },
    technicalSettings: { type: "string", description: "Formato, relación de aspecto y ajustes relevantes para el modelo destino." },
    variations: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    publishabilityChecklist: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 8 },
  },
})

export const creativeReviewSchema = jsonSchema<CreativeReview>({
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "scores", "strengths", "issues", "correctionPrompt", "layoutCorrection", "nextSteps"],
  properties: {
    verdict: { type: "string", enum: ["publishable", "needs-work", "reject"] },
    summary: { type: "string" },
    scores: {
      type: "object",
      additionalProperties: false,
      required: ["brandConsistency", "taskAlignment", "socialPublishability", "mobileLegibility", "visualAuthenticity"],
      properties: {
        brandConsistency: { type: "integer", minimum: 1, maximum: 5 },
        taskAlignment: { type: "integer", minimum: 1, maximum: 5 },
        socialPublishability: { type: "integer", minimum: 1, maximum: 5 },
        mobileLegibility: { type: "integer", minimum: 1, maximum: 5 },
        visualAuthenticity: { type: "integer", minimum: 1, maximum: 5 },
      },
    },
    strengths: { type: "array", items: { type: "string" }, maxItems: 8 },
    issues: { type: "array", items: { type: "string" }, maxItems: 8 },
    correctionPrompt: { type: "string", description: "Prompt quirúrgico para regenerar únicamente la imagen base, siempre sin texto ni elementos gráficos." },
    layoutCorrection: { type: "string", description: "Corrección separada para titular, jerarquía, márgenes y composición final en redes." },
    nextSteps: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
})
