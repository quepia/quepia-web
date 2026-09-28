import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { ArcaEnvironment, IssuerCondition } from "facturas"
import { decryptSecret } from "./secret-box"

/** Encabezado impreso que el Padrón no informa o que sirve de respaldo. */
export interface IssuerHeader {
  name: string | null
  address: string | null
  /** YYYY-MM-DD */
  activityStart: string | null
  grossIncome: string | null
}

export interface InvoicingConfig {
  taxId: string
  certificatePem: string
  privateKeyPem: string
  environment: ArcaEnvironment
  salesPoint: number
  issuer: IssuerCondition
  header: IssuerHeader
  /** De dónde salió: la pantalla de configuración o las variables ARCA_*. */
  source: "settings" | "env"
}

// Solo emisores de clase C: la factura lleva un único importe sin IVA
// discriminado. Un responsable inscripto necesita alícuotas por ítem.
export const ISSUERS: readonly IssuerCondition[] = [
  "monotributo",
  "exento",
  "no_alcanzado",
]

export interface StoredSettings {
  active_environment: ArcaEnvironment
  tax_id: string | null
  issuer_condition: IssuerCondition | null
  issuer_name: string | null
  issuer_address: string | null
  issuer_activity_start: string | null
  issuer_gross_income: string | null
  updated_at: string
}

export interface StoredCredentials {
  environment: ArcaEnvironment
  sales_point: number | null
  certificate_pem: string | null
  certificate_expires_at: string | null
  private_key_encrypted: string | null
  csr_pem: string | null
  key_created_at: string | null
  updated_at: string
}

export interface StoredInvoicing {
  settings: StoredSettings
  credentials: Partial<Record<ArcaEnvironment, StoredCredentials>>
}

/** Contexto del cifrado: la clave de un entorno no descifra en otro. */
export function privateKeyContext(environment: ArcaEnvironment): string {
  return `arca-private-key:${environment}`
}

export async function loadStoredInvoicing(db: SupabaseClient): Promise<StoredInvoicing | null> {
  const { data, error } = await db.rpc("invoicing_settings_get", { p_request: {} })
  if (error || !data?.ok || !data.data?.settings) return null
  return data.data as StoredInvoicing
}

// Vercel guarda los PEM en una sola línea; se aceptan con "\n" literales.
function pem(value: string | undefined): string {
  return (value ?? "").replace(/\\n/g, "\n").trim()
}

function envHeader(env: Record<string, string | undefined>): IssuerHeader {
  const start = env.ARCA_ISSUER_ACTIVITY_START ?? ""
  return {
    name: env.ARCA_ISSUER_NAME?.trim() || null,
    address: env.ARCA_ISSUER_ADDRESS?.trim() || null,
    activityStart: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : null,
    grossIncome: env.ARCA_ISSUER_GROSS_INCOME?.trim() || null,
  }
}

/**
 * Configuración por variables ARCA_*, el mecanismo anterior. Devuelve null si
 * falta cualquier dato: la facturación queda deshabilitada, nunca adivinada.
 */
export function readEnvInvoicingConfig(
  env: Record<string, string | undefined> = process.env,
): InvoicingConfig | null {
  const taxId = (env.ARCA_TAX_ID ?? "").replace(/\D/g, "")
  const certificatePem = pem(env.ARCA_CERTIFICATE_PEM)
  const privateKeyPem = pem(env.ARCA_PRIVATE_KEY_PEM)
  const environment = env.ARCA_ENVIRONMENT
  const salesPoint = Number(env.ARCA_SALES_POINT)
  const issuer = env.ARCA_ISSUER_CONDITION as IssuerCondition | undefined

  if (
    taxId.length !== 11 ||
    !certificatePem ||
    !privateKeyPem ||
    (environment !== "test" && environment !== "production") ||
    !Number.isInteger(salesPoint) ||
    salesPoint < 1 ||
    !issuer ||
    !ISSUERS.includes(issuer)
  ) {
    return null
  }

  return {
    taxId,
    certificatePem,
    privateKeyPem,
    environment,
    salesPoint,
    issuer,
    header: envHeader(env),
    source: "env",
  }
}

/** Configuración de un entorno guardada en el sistema, o null si está incompleta. */
export function configFromStored(
  stored: StoredInvoicing,
  environment: ArcaEnvironment,
): InvoicingConfig | null {
  const { settings } = stored
  const credentials = stored.credentials[environment]
  if (
    !settings.tax_id ||
    !settings.issuer_condition ||
    !ISSUERS.includes(settings.issuer_condition) ||
    !credentials?.sales_point ||
    !credentials.certificate_pem ||
    !credentials.private_key_encrypted
  ) {
    return null
  }
  return {
    taxId: settings.tax_id,
    certificatePem: credentials.certificate_pem,
    privateKeyPem: decryptSecret(credentials.private_key_encrypted, privateKeyContext(environment)),
    environment,
    salesPoint: credentials.sales_point,
    issuer: settings.issuer_condition,
    header: {
      name: settings.issuer_name,
      address: settings.issuer_address,
      activityStart: settings.issuer_activity_start,
      grossIncome: settings.issuer_gross_income,
    },
    source: "settings",
  }
}

/**
 * La configuración con la que se emite. Manda la pantalla de configuración
 * cuando el entorno activo está completo; si no, las variables ARCA_*. Lanza
 * InvoicingKeyError si hay una clave guardada que no se puede descifrar: es
 * mejor no emitir que emitir con otras credenciales sin avisar.
 */
export async function loadInvoicingConfig(db: SupabaseClient): Promise<InvoicingConfig | null> {
  const stored = await loadStoredInvoicing(db)
  if (stored) {
    const config = configFromStored(stored, stored.settings.active_environment)
    if (config) return config
  }
  return readEnvInvoicingConfig()
}
