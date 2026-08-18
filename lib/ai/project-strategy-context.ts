import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CompetitorAnalysisContent,
  StrategyDocumentStatus,
  StrategyDocumentType,
  StrategyNarrativeContent,
} from "@/types/sistema";
import { STRATEGY_DOCUMENT_LABELS } from "@/types/sistema";

const ACTIVE_STATUSES: StrategyDocumentStatus[] = ["reviewed", "published"];
const DOCUMENT_TYPES = new Set<StrategyDocumentType>([
  "product_information",
  "marketing_strategy",
  "competitor_analysis",
  "brand_voice",
  "content_strategy",
]);

export interface ActiveStrategyDocument {
  documentType: StrategyDocumentType;
  title: string;
  status: "reviewed" | "published";
  version: number;
  content: CompetitorAnalysisContent | StrategyNarrativeContent;
}

interface StrategyDocumentRecord {
  document_type: string;
  title: string | null;
  status: StrategyDocumentStatus;
  version: number;
  content: unknown;
}

function cleanString(value: unknown, maxLength = 4_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStringList(value: unknown, maxItems = 8, maxLength = 800) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxItems)
    .map((item) => cleanString(item, maxLength))
    .filter(Boolean);
}

function formatList(label: string, value: unknown) {
  const items = cleanStringList(value);
  return items.length ? `${label}: ${items.join(" | ")}` : "";
}

function formatNarrativeDocument(document: ActiveStrategyDocument) {
  const content = document.content as StrategyNarrativeContent;
  const sections = Array.isArray(content.sections)
    ? content.sections
        .slice(0, 8)
        .map((section) => {
          const title = cleanString(section?.title, 300);
          const summary = cleanString(section?.summary, 1_500);
          const points = cleanStringList(section?.points, 5, 500);
          return [
            title ? `- ${title}${summary ? `: ${summary}` : ""}` : "",
            points.length ? `  Decisiones: ${points.join(" | ")}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        })
        .filter(Boolean)
    : [];

  return [
    `DOCUMENTO ACTIVO: ${STRATEGY_DOCUMENT_LABELS[document.documentType]} · v${document.version}`,
    cleanString(content.executiveSummary, 3_000),
    ...sections,
    formatList("Próximas acciones", content.nextActions),
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCompetitorDocument(document: ActiveStrategyDocument) {
  const content = document.content as CompetitorAnalysisContent;
  const competitors = Array.isArray(content.competitors)
    ? content.competitors
        .slice(0, 6)
        .map((competitor) =>
          [
            cleanString(competitor?.name, 200),
            cleanString(competitor?.positioning, 700),
            formatList("fortalezas", competitor?.strengths),
            formatList("diferenciales", competitor?.differentiators),
          ]
            .filter(Boolean)
            .join(" · "),
        )
        .filter(Boolean)
    : [];

  return [
    `DOCUMENTO ACTIVO: ${STRATEGY_DOCUMENT_LABELS[document.documentType]} · v${document.version}`,
    cleanString(content.executiveSummary, 3_000),
    cleanString(content.marketPosition, 2_000),
    formatList("Fortalezas defendibles", content.clientStrengths),
    formatList("Riesgos competitivos", content.clientRisks),
    competitors.length
      ? `Competidores observados:\n${competitors.map((item) => `- ${item}`).join("\n")}`
      : "",
    formatList("Movimientos recomendados", content.recommendedActions),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadActiveStrategyDocuments(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ActiveStrategyDocument[]> {
  const { data, error } = await supabase
    .from("sistema_strategy_documents")
    .select("document_type, title, status, version, content")
    .eq("project_id", projectId)
    .in("status", ACTIVE_STATUSES)
    .order("version", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const latestByType = new Map<StrategyDocumentType, ActiveStrategyDocument>();
  for (const row of (data || []) as StrategyDocumentRecord[]) {
    if (!DOCUMENT_TYPES.has(row.document_type as StrategyDocumentType))
      continue;
    if (row.status !== "reviewed" && row.status !== "published") continue;
    const documentType = row.document_type as StrategyDocumentType;
    if (latestByType.has(documentType)) continue;
    if (!row.content || typeof row.content !== "object") continue;
    latestByType.set(documentType, {
      documentType,
      title:
        cleanString(row.title, 300) || STRATEGY_DOCUMENT_LABELS[documentType],
      status: row.status,
      version: row.version,
      content: row.content as
        | CompetitorAnalysisContent
        | StrategyNarrativeContent,
    });
  }

  return Array.from(latestByType.values());
}

export function formatActiveStrategyContext(
  documents: ActiveStrategyDocument[],
) {
  if (!documents.length) return "";

  const formatted = documents.map((document) =>
    document.documentType === "competitor_analysis"
      ? formatCompetitorDocument(document)
      : formatNarrativeDocument(document),
  );

  return [
    "ESTRATEGIA APROBADA DEL PROYECTO — CONTEXTO OPERATIVO",
    "Estos documentos ya fueron revisados por una persona. Usalos para orientar decisiones y mantener coherencia entre tareas, contenido, calendario y producción creativa. El brief de marca y las instrucciones explícitas del usuario conservan prioridad ante cualquier contradicción.",
    ...formatted,
  ]
    .join("\n\n")
    .slice(0, 24_000);
}
