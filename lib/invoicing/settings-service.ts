import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { toArcaSafeErrorMetadata, type ArcaEnvironment } from "facturas"
import { z } from "zod"
import {
  configFromStored,
  ISSUERS,
  loadStoredInvoicing,
  privateKeyContext,
  readEnvInvoicingConfig,
  type StoredCredentials,
  type StoredInvoicing,
} from "./config"
import {
  assertPrivateKey,
  generateKeyAndCsr,
  keyMatchesCertificate,
  normalizePem,
  readCertificate,
  type CertificateFacts,
} from "./credentials"
import { createIssuingClient } from "./issue-invoice"
import { decryptSecret, encryptSecret, hasMasterKey } from "./secret-box"

const ENVIRONMENTS: readonly ArcaEnvironment[] = ["test", "production"]
const CONNECTION_TIMEOUT_MS = 25_000
// Aviso de renovación: los certificados de ARCA duran dos años.
const EXPIRY_WARNING_DAYS = 30

export interface EnvironmentView {
  sales_point: number | null
  has_private_key: boolean
  key_created_at: string | null
  csr_pem: string | null
  certificate: (CertificateFacts & { matches_key: boolean | null }) | null
  ready: boolean
  problems: string[]
}

export interface SettingsView {
  master_key: boolean
  active_environment: ArcaEnvironment
  /** Con qué se emite hoy: esta configuración, las variables ARCA_* o nada. */
  issuing_from: "settings" | "env" | "none"
  env_import_available: boolean
  issuer: {
    tax_id: string | null
    issuer_condition: string | null
    issuer_name: string | null
    issuer_address: string | null
    issuer_activity_start: string | null
    issuer_gross_income: string | null
  }
  environments: Record<ArcaEnvironment, EnvironmentView>
}

export class SettingsError extends Error {}

function environmentView(stored: StoredInvoicing, environment: ArcaEnvironment): EnvironmentView {
  const credentials = stored.credentials[environment]
  const problems: string[] = []
  let certificate: EnvironmentView["certificate"] = null

  if (credentials?.certificate_pem) {
    try {
      const facts = readCertificate(credentials.certificate_pem)
      let matchesKey: boolean | null = null
      if (credentials.private_key_encrypted && hasMasterKey()) {
        try {
          matchesKey = keyMatchesCertificate(
            credentials.certificate_pem,
            decryptSecret(credentials.private_key_encrypted, privateKeyContext(environment)),
          )
        } catch {
          problems.push("La clave privada guardada no se puede descifrar con la INVOICING_ENCRYPTION_KEY actual.")
        }
      }
      certificate = { ...facts, matches_key: matchesKey }
      if (matchesKey === false) problems.push("El certificado no corresponde a la clave privada guardada.")
      if (stored.settings.tax_id && facts.taxId && facts.taxId !== stored.settings.tax_id) {
        problems.push(`El certificado es del CUIT ${facts.taxId}, no del configurado.`)
      }
      const daysLeft = (Date.parse(facts.notAfter) - Date.now()) / 86_400_000
      if (daysLeft <= 0) problems.push("El certificado está vencido: generá uno nuevo.")
      else if (daysLeft <= EXPIRY_WARNING_DAYS) problems.push(`El certificado vence en ${Math.ceil(daysLeft)} días: renovalo.`)
    } catch {
      problems.push("El certificado guardado no se puede leer.")
    }
  }

  const ready =
    Boolean(stored.settings.tax_id && stored.settings.issuer_condition) &&
    Boolean(credentials?.sales_point && credentials.certificate_pem && credentials.private_key_encrypted) &&
    certificate?.matches_key === true &&
    problems.length === 0

  return {
    sales_point: credentials?.sales_point ?? null,
    has_private_key: Boolean(credentials?.private_key_encrypted),
    key_created_at: credentials?.key_created_at ?? null,
    csr_pem: credentials?.csr_pem ?? null,
    certificate,
    ready,
    problems,
  }
}

export async function getSettingsView(db: SupabaseClient): Promise<SettingsView> {
  const stored = await loadStoredInvoicing(db)
  if (!stored) throw new SettingsError("No tenés permiso para ver la configuración de facturación.")

  let issuingFrom: SettingsView["issuing_from"] = "none"
  try {
    if (configFromStored(stored, stored.settings.active_environment)) issuingFrom = "settings"
  } catch {
    // Clave guardada que no se descifra: el problema se informa en el entorno.
  }
  if (issuingFrom === "none" && readEnvInvoicingConfig()) issuingFrom = "env"

  const { settings } = stored
  return {
    master_key: hasMasterKey(),
    active_environment: settings.active_environment,
    issuing_from: issuingFrom,
    env_import_available: Boolean(readEnvInvoicingConfig()),
    issuer: {
      tax_id: settings.tax_id,
      issuer_condition: settings.issuer_condition,
      issuer_name: settings.issuer_name,
      issuer_address: settings.issuer_address,
      issuer_activity_start: settings.issuer_activity_start,
      issuer_gross_income: settings.issuer_gross_income,
    },
    environments: {
      test: environmentView(stored, "test"),
      production: environmentView(stored, "production"),
    },
  }
}

async function save(db: SupabaseClient, request: Record<string, unknown>): Promise<void> {
  const { data, error } = await db.rpc("invoicing_settings_save", { p_request: request })
  if (error) throw new SettingsError(`No se pudo guardar: ${error.message}`)
  if (!data?.ok) {
    throw new SettingsError(
      data?.error?.code === "production_not_ready"
        ? "Para pasar a producción completá antes el emisor y las credenciales de producción."
        : data?.error?.message ?? "No se pudo guardar la configuración.",
    )
  }
}

function requireMasterKey(): void {
  if (!hasMasterKey()) {
    throw new SettingsError(
      "Falta INVOICING_ENCRYPTION_KEY en el servidor: sin ella no se puede guardar la clave privada de forma segura.",
    )
  }
}

const environmentSchema = z.enum(["test", "production"])
const optionalText = (max: number) =>
  z.string().trim().max(max).transform((value) => value || null).nullable().optional()

export const settingsActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save_issuer"),
    tax_id: z.string().transform((value) => value.replace(/\D/g, "")).pipe(z.string().regex(/^\d{11}$/, "El CUIT tiene 11 dígitos")),
    issuer_condition: z.enum(ISSUERS as [string, ...string[]]),
    issuer_name: optionalText(200),
    issuer_address: optionalText(300),
    issuer_activity_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("").transform(() => null)),
    issuer_gross_income: optionalText(40),
  }).strict(),
  z.object({ action: z.literal("generate_csr"), environment: environmentSchema }).strict(),
  z.object({ action: z.literal("save_certificate"), environment: environmentSchema, certificate_pem: z.string().min(100).max(20000) }).strict(),
  z.object({
    action: z.literal("import_key"),
    environment: environmentSchema,
    private_key_pem: z.string().min(100).max(20000),
    certificate_pem: z.string().min(100).max(20000).optional(),
  }).strict(),
  z.object({ action: z.literal("import_env") }).strict(),
  z.object({ action: z.literal("save_sales_point"), environment: environmentSchema, sales_point: z.number().int().min(1).max(99998) }).strict(),
  z.object({ action: z.literal("set_environment"), environment: environmentSchema }).strict(),
  z.object({ action: z.literal("test_connection"), environment: environmentSchema }).strict(),
])

export type SettingsAction = z.infer<typeof settingsActionSchema>

export interface ActionResult {
  message: string
  sales_points?: Array<{ number: number; emission_type: string | null; blocked: boolean; deleted: boolean }>
}

function certificateChecks(certificatePem: string, privateKeyPem: string, taxId: string | null): CertificateFacts {
  let facts: CertificateFacts
  try {
    facts = readCertificate(certificatePem)
  } catch {
    throw new SettingsError("Eso no es un certificado válido: pegá todo el bloque de BEGIN CERTIFICATE a END CERTIFICATE.")
  }
  if (!keyMatchesCertificate(certificatePem, privateKeyPem)) {
    throw new SettingsError("El certificado no corresponde a la clave de este entorno. ¿Lo generaste con el último pedido (CSR)?")
  }
  if (taxId && facts.taxId && facts.taxId !== taxId) {
    throw new SettingsError(`El certificado es del CUIT ${facts.taxId} y el emisor configurado es ${taxId}.`)
  }
  if (Date.parse(facts.notAfter) <= Date.now()) {
    throw new SettingsError("El certificado está vencido.")
  }
  return facts
}

function storedKey(credentials: StoredCredentials | undefined, environment: ArcaEnvironment): string {
  if (!credentials?.private_key_encrypted) {
    throw new SettingsError("Primero generá la clave y el pedido de certificado de este entorno.")
  }
  return decryptSecret(credentials.private_key_encrypted, privateKeyContext(environment))
}

export async function runSettingsAction(db: SupabaseClient, action: SettingsAction): Promise<ActionResult> {
  const stored = await loadStoredInvoicing(db)
  if (!stored) throw new SettingsError("No tenés permiso para cambiar la configuración de facturación.")

  switch (action.action) {
    case "save_issuer": {
      const { action: _, ...settings } = action
      void _
      await save(db, { settings })
      return { message: "Datos del emisor guardados." }
    }

    case "generate_csr": {
      requireMasterKey()
      const taxId = stored.settings.tax_id
      if (!taxId) throw new SettingsError("Primero guardá el CUIT del emisor.")
      const commonName = action.environment === "test" ? "quepiaTest" : "quepia"
      const { privateKeyPem, csrPem } = await generateKeyAndCsr(taxId, commonName)
      // Una clave nueva invalida el certificado anterior de este entorno.
      await save(db, {
        environment: action.environment,
        credentials: {
          private_key_encrypted: encryptSecret(privateKeyPem, privateKeyContext(action.environment)),
          csr_pem: csrPem,
          key_created_at: new Date().toISOString(),
          certificate_pem: null,
          certificate_expires_at: null,
        },
      })
      return { message: "Clave privada generada y guardada cifrada. Copiá el pedido de certificado (CSR) y seguí los pasos en ARCA." }
    }

    case "save_certificate": {
      const certificatePem = normalizePem(action.certificate_pem)
      const privateKeyPem = storedKey(stored.credentials[action.environment], action.environment)
      const facts = certificateChecks(certificatePem, privateKeyPem, stored.settings.tax_id)
      await save(db, {
        environment: action.environment,
        credentials: { certificate_pem: certificatePem, certificate_expires_at: facts.notAfter },
      })
      return { message: `Certificado guardado. Vence el ${facts.notAfter.slice(0, 10)}.` }
    }

    case "import_key": {
      requireMasterKey()
      const privateKeyPem = normalizePem(action.private_key_pem)
      try {
        assertPrivateKey(privateKeyPem)
      } catch {
        throw new SettingsError("Eso no es una clave privada RSA válida (archivo .key en formato PEM).")
      }
      const credentials: Record<string, unknown> = {
        private_key_encrypted: encryptSecret(privateKeyPem, privateKeyContext(action.environment)),
        csr_pem: null,
        key_created_at: new Date().toISOString(),
        certificate_pem: null,
        certificate_expires_at: null,
      }
      if (action.certificate_pem) {
        const certificatePem = normalizePem(action.certificate_pem)
        const facts = certificateChecks(certificatePem, privateKeyPem, stored.settings.tax_id)
        credentials.certificate_pem = certificatePem
        credentials.certificate_expires_at = facts.notAfter
      }
      await save(db, { environment: action.environment, credentials })
      return { message: "Clave importada y guardada cifrada." }
    }

    case "import_env": {
      requireMasterKey()
      const env = readEnvInvoicingConfig()
      if (!env) throw new SettingsError("No hay una configuración completa en las variables ARCA_* del servidor.")
      const facts = certificateChecks(env.certificatePem, env.privateKeyPem, env.taxId)
      await save(db, {
        settings: {
          tax_id: env.taxId,
          issuer_condition: env.issuer,
          issuer_name: env.header.name,
          issuer_address: env.header.address,
          issuer_activity_start: env.header.activityStart,
          issuer_gross_income: env.header.grossIncome,
        },
      })
      await save(db, {
        environment: env.environment,
        credentials: {
          sales_point: env.salesPoint,
          private_key_encrypted: encryptSecret(env.privateKeyPem, privateKeyContext(env.environment)),
          certificate_pem: env.certificatePem,
          certificate_expires_at: facts.notAfter,
          csr_pem: null,
          key_created_at: new Date().toISOString(),
        },
      })
      return {
        message: `Configuración de ${env.environment === "test" ? "homologación" : "producción"} importada desde las variables ARCA_*. Ya podés quitarlas del entorno.`,
      }
    }

    case "save_sales_point":
      await save(db, { environment: action.environment, credentials: { sales_point: action.sales_point } })
      return { message: `Punto de venta ${action.sales_point} guardado.` }

    case "set_environment":
      await save(db, { settings: { active_environment: action.environment } })
      return {
        message:
          action.environment === "production"
            ? "Producción activada: desde ahora las facturas son reales ante ARCA."
            : "Homologación activada: las facturas son de prueba.",
      }

    case "test_connection": {
      let config
      try {
        config = configFromStored(stored, action.environment)
      } catch (error) {
        throw new SettingsError(error instanceof Error ? error.message : "No se pudo leer la clave privada.")
      }
      if (!config) {
        // El punto de venta se consulta antes de elegirlo: se prueba con 1.
        const credentials = stored.credentials[action.environment]
        if (stored.settings.tax_id && stored.settings.issuer_condition && credentials?.certificate_pem && credentials.private_key_encrypted) {
          config = configFromStored(
            { ...stored, credentials: { ...stored.credentials, [action.environment]: { ...credentials, sales_point: 1 } } },
            action.environment,
          )
        }
      }
      if (!config) throw new SettingsError("Completá el emisor, la clave y el certificado de este entorno antes de probar.")

      const arca = createIssuingClient(db, config)
      try {
        const points = await Promise.race([
          arca.wsfe.getSalesPoints(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("ARCA no respondió a tiempo")), CONNECTION_TIMEOUT_MS),
          ),
        ])
        const salesPoints = points.map((point) => ({
          number: point.number,
          emission_type: point.emissionType ?? null,
          blocked: point.blocked,
          deleted: Boolean(point.deletedAt),
        }))
        return {
          message:
            salesPoints.length > 0
              ? `Conexión con ARCA correcta. Puntos de venta para web services: ${salesPoints.map((point) => point.number).join(", ")}.`
              : action.environment === "test"
                ? "Conexión con ARCA correcta. En homologación ARCA no informa puntos de venta: podés usar cualquier número (por ejemplo 1)."
                : "Conexión con ARCA correcta, pero no hay puntos de venta para web services: creá uno en ARCA.",
          sales_points: salesPoints,
        }
      } catch (error) {
        const safe = toArcaSafeErrorMetadata(error)
        const hint =
          safe.reason === "unauthorized_computer" || safe.reason === "missing_relationship"
            ? " El certificado no está autorizado para Facturación Electrónica (wsfe): revisá la autorización en ARCA."
            : /TA v[aá]lido|alreadyAuthenticated/i.test(safe.message)
              ? " ARCA tiene abierta otra sesión con este certificado (por ejemplo, del CLI). Se libera sola en hasta 12 horas."
              : ""
        throw new SettingsError(`ARCA respondió con un error: ${safe.message}.${hint}`)
      }
    }
  }
}

export { ENVIRONMENTS }
