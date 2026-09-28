import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import {
  createArcaClient,
  toArcaSafeErrorMetadata,
  type PadronAddress,
  type PadronTaxpayerResult,
} from "facturas"
import type { InvoicingConfig } from "./config"
import type { InvoiceRow } from "./issue-invoice"
import { createSupabaseArcaStore } from "./supabase-store"

// El primer login WSAA de un servicio nuevo más la constancia, en
// homologación, puede tardar bastante más que una emisión.
const PADRON_TIMEOUT_MS = 25_000

export interface FiscalParty {
  name: string | null
  address: string | null
  condition_label: string
}

export interface FiscalSnapshot {
  source: "padron" | "fallback"
  fetched_at: string
  issuer: FiscalParty & {
    tax_id: string
    gross_income: string
    activity_start: string | null
  }
  receiver: FiscalParty
  warning?: string
}

// Textos con los que ARCA imprime la condición frente al IVA.
const CONDITION_LABELS: Record<string, string> = {
  responsable_inscripto: "IVA Responsable Inscripto",
  monotributo: "Responsable Monotributo",
  exento: "IVA Sujeto Exento",
  no_alcanzado: "IVA No Alcanzado",
  consumidor_final: "Consumidor Final",
}

export function conditionLabel(condition: string | undefined | null): string {
  return (condition && CONDITION_LABELS[condition]) || "Consumidor Final"
}

function addressLine(address: PadronAddress | undefined): string | null {
  if (!address) return null
  const place = [address.city, address.province].filter(Boolean).join(", ")
  const line = [address.street, place].filter(Boolean).join(" - ")
  return line || null
}

// La constancia informa la fecha de inicio de actividades con distinto nombre
// según el régimen; si no aparece, se usa el período de la actividad más vieja.
function activityStart(taxpayer: PadronTaxpayerResult): string | null {
  const stack: unknown[] = [taxpayer.raw]
  while (stack.length > 0) {
    const value = stack.pop()
    if (!value || typeof value !== "object") continue
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (/inicio.*actividad/i.test(key) && typeof child === "string" && /^\d{4}-\d{2}-\d{2}/.test(child)) {
        return child.slice(0, 10)
      }
      if (child && typeof child === "object") stack.push(child)
    }
  }
  const periods = taxpayer.activities
    .map((activity) => activity.since)
    .filter((since): since is string => Boolean(since))
    .sort()
  return periods[0] ?? null
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("El Padrón de ARCA no respondió a tiempo")), PADRON_TIMEOUT_MS),
    ),
  ])
}

// Encabezado de respaldo, de la pantalla de configuración (o ARCA_ISSUER_*),
// para cuando el Padrón no trae los datos, como el de homologación, que no
// tiene contribuyentes reales. Lo que informa el Padrón tiene prioridad.
function issuerOverride(config: InvoicingConfig | null) {
  return {
    name: config?.header.name ?? null,
    address: config?.header.address ?? null,
    activityStart: config?.header.activityStart ?? null,
  }
}

function fallbackSnapshot(
  config: InvoicingConfig | null,
  invoice: InvoiceRow,
  clientName: string | null,
  warning: string,
): FiscalSnapshot {
  const taxId = config?.taxId ?? ""
  const override = issuerOverride(config)
  return {
    source: "fallback",
    fetched_at: new Date().toISOString(),
    issuer: {
      tax_id: taxId,
      name: override.name,
      address: override.address,
      condition_label: conditionLabel(invoice.issuer_condition),
      gross_income: config?.header.grossIncome || taxId,
      activity_start: override.activityStart,
    },
    receiver: {
      name:
        invoice.receiver_condition === "consumidor_final" && !invoice.receiver_doc_number
          ? "Consumidor Final"
          : invoice.receiver_name ?? clientName,
      address: null,
      condition_label: conditionLabel(invoice.receiver_condition),
    },
    warning,
  }
}

/** Foto armada solo con lo guardado, sin consultar ARCA. */
export function offlineSnapshot(
  config: InvoicingConfig | null,
  invoice: InvoiceRow,
  clientName: string | null,
): FiscalSnapshot {
  return fallbackSnapshot(
    config,
    invoice,
    clientName,
    "Todavía no se consultaron los datos del Padrón de ARCA.",
  )
}

/**
 * Consulta en el Padrón de ARCA (constancia de inscripción) los datos del
 * emisor y, si se facturó a un CUIT, los del receptor. Nunca lanza: si el
 * Padrón no está habilitado o falla, devuelve una foto parcial con el motivo.
 */
export async function buildFiscalSnapshot(
  db: SupabaseClient,
  config: InvoicingConfig | null,
  invoice: InvoiceRow,
  clientName: string | null,
): Promise<FiscalSnapshot> {
  if (!config) {
    return fallbackSnapshot(config, invoice, clientName, "La facturación ARCA no está configurada en el servidor.")
  }

  const arca = createArcaClient({
    taxId: config.taxId,
    certificatePem: config.certificatePem,
    privateKeyPem: config.privateKeyPem,
    environment: config.environment,
    store: createSupabaseArcaStore(db),
    logger: { level: "warn" },
  })

  try {
    const issuer = await withTimeout(arca.padron.getTaxpayerDetails(config.taxId))
    // Sin datos del emisor la foto no es definitiva: se reintenta más tarde.
    // En homologación es lo esperable, el padrón de prueba no tiene CUIT reales.
    if (!issuer?.name) {
      const fallback = fallbackSnapshot(
        config,
        invoice,
        clientName,
        config.environment === "test"
          ? `El Padrón de prueba de ARCA no tiene datos del CUIT ${config.taxId} (en producción sí los tiene).`
          : `El Padrón de ARCA no devolvió datos del CUIT ${config.taxId}.`,
      )
      // Con el respaldo configurado el encabezado ya está completo.
      if (fallback.issuer.name) delete fallback.warning
      return fallback
    }
    const receiver =
      invoice.receiver_doc_type === "cuit" && invoice.receiver_doc_number
        ? await withTimeout(arca.padron.getTaxpayerDetails(invoice.receiver_doc_number))
        : null

    const override = issuerOverride(config)
    return {
      source: "padron",
      fetched_at: new Date().toISOString(),
      issuer: {
        tax_id: config.taxId,
        name: issuer.name,
        address: addressLine(issuer.address) ?? override.address,
        condition_label: conditionLabel(invoice.issuer_condition),
        gross_income: config.header.grossIncome || config.taxId,
        activity_start: activityStart(issuer) ?? override.activityStart,
      },
      receiver: {
        name:
          receiver?.name ??
          (invoice.receiver_doc_number ? invoice.receiver_name ?? clientName : "Consumidor Final"),
        address: addressLine(receiver?.address),
        condition_label: conditionLabel(invoice.receiver_condition),
      },
    }
  } catch (error) {
    const safe = toArcaSafeErrorMetadata(error)
    const notAuthorized =
      safe.reason === "unauthorized_computer" || safe.reason === "missing_relationship"
    // ARCA no da un ticket nuevo mientras vive otro del mismo servicio: pasa si
    // dos consultas se cruzaron o si se usó el CLI con este certificado.
    const ticketBusy = /TA v[aá]lido|alreadyAuthenticated/i.test(safe.message)
    return fallbackSnapshot(
      config,
      invoice,
      clientName,
      notAuthorized
        ? "El certificado no está autorizado para el Padrón de ARCA (servicio ws_sr_constancia_inscripcion)."
        : ticketBusy
          ? "ARCA todavía tiene abierta otra sesión del Padrón para este certificado."
          : `No se pudo consultar el Padrón de ARCA: ${safe.message}`,
    )
  }
}
