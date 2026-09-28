"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, ChevronDown, Copy, Loader2, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/sistema/utils"

type Environment = "test" | "production"

interface EnvironmentView {
    sales_point: number | null
    has_private_key: boolean
    key_created_at: string | null
    csr_pem: string | null
    certificate: {
        taxId: string | null
        commonName: string | null
        issuer: string | null
        notBefore: string
        notAfter: string
        matches_key: boolean | null
    } | null
    ready: boolean
    problems: string[]
}

interface SettingsView {
    master_key: boolean
    active_environment: Environment
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
    environments: Record<Environment, EnvironmentView>
}

interface SalesPoint {
    number: number
    emission_type: string | null
    blocked: boolean
    deleted: boolean
}

const ENV_LABEL: Record<Environment, string> = { test: "Homologación (prueba)", production: "Producción" }
const inputClass =
    "w-full px-3 py-2 bg-white/[0.04] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30"
const secondaryButton =
    "flex items-center gap-2 px-3 py-2 text-sm text-white/80 hover:text-white border border-white/10 hover:border-white/20 rounded-lg disabled:opacity-40"
const primaryButton =
    "flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-sm font-medium"

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    return (
        <section className="rounded-lg border border-white/[0.08] p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {description && <p className="mt-1 text-xs text-white/50">{description}</p>}
            <div className="mt-4">{children}</div>
        </section>
    )
}

function Step({ index, title, done, children }: { index: number; title: string; done: boolean; children: React.ReactNode }) {
    return (
        <div className="flex gap-3">
            <div className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px]",
                done ? "border-emerald-500/60 text-emerald-400" : "border-white/20 text-white/50",
            )}>
                {done ? <Check className="h-3 w-3" /> : index}
            </div>
            <div className="min-w-0 flex-1 pb-5">
                <p className="text-sm text-white/90">{title}</p>
                <div className="mt-2 space-y-2 text-xs text-white/60">{children}</div>
            </div>
        </div>
    )
}

function Guide({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <details className="group border-b border-white/[0.06] py-3 last:border-0">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-white/80">
                {title}
                <ChevronDown className="h-4 w-4 text-white/40 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-3 space-y-2 text-xs leading-relaxed text-white/60">{children}</div>
        </details>
    )
}

export function AccountingInvoicingSettings() {
    const [view, setView] = useState<SettingsView | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [busy, setBusy] = useState<string | null>(null)
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
    const [environment, setEnvironment] = useState<Environment>("test")
    const [issuerForm, setIssuerForm] = useState<SettingsView["issuer"] | null>(null)
    const [certificateText, setCertificateText] = useState("")
    const [salesPointText, setSalesPointText] = useState("")
    const [salesPoints, setSalesPoints] = useState<SalesPoint[] | null>(null)
    const [importKey, setImportKey] = useState("")
    const [importCert, setImportCert] = useState("")
    const [copied, setCopied] = useState(false)

    const applyView = useCallback((next: SettingsView) => {
        setView(next)
        setIssuerForm(next.issuer)
    }, [])

    useEffect(() => {
        fetch("/api/invoicing/settings")
            .then((response) => response.json())
            .then((body) => {
                if (body?.ok) {
                    applyView(body.data)
                    setEnvironment(body.data.active_environment)
                } else {
                    setLoadError(body?.error?.message ?? "No se pudo cargar la configuración.")
                }
            })
            .catch(() => setLoadError("No se pudo cargar la configuración."))
    }, [applyView])

    useEffect(() => {
        const current = view?.environments[environment].sales_point
        setSalesPointText(current ? String(current) : "")
        setSalesPoints(null)
        setCertificateText("")
    }, [environment, view?.environments])

    const run = async (action: Record<string, unknown>, key: string) => {
        setBusy(key)
        setMessage(null)
        try {
            const response = await fetch("/api/invoicing/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action),
            })
            const body = await response.json().catch(() => null)
            if (body?.ok) {
                applyView(body.data.settings)
                if (body.data.sales_points) setSalesPoints(body.data.sales_points)
                setMessage({ ok: true, text: body.data.message })
                return true
            }
            setMessage({ ok: false, text: body?.error?.message ?? "No se pudo completar la acción." })
            return false
        } catch {
            setMessage({ ok: false, text: "No se pudo contactar al servidor." })
            return false
        } finally {
            setBusy(null)
        }
    }

    if (loadError) {
        return <p className="p-6 text-sm text-red-300">{loadError}</p>
    }
    if (!view || !issuerForm) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
        )
    }

    const env = view.environments[environment]
    const issuerSaved = Boolean(view.issuer.tax_id && view.issuer.issuer_condition)
    const certificateOk = Boolean(env.certificate && env.certificate.matches_key)
    const active = view.environments[view.active_environment]

    const saveIssuer = () =>
        run({ action: "save_issuer", ...issuerForm, tax_id: issuerForm.tax_id ?? "", issuer_condition: issuerForm.issuer_condition ?? "" }, "issuer")

    const copyCsr = async () => {
        if (!env.csr_pem) return
        await navigator.clipboard.writeText(env.csr_pem).catch(() => undefined)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
            {/* Estado */}
            <div className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3",
                active.ready ? "border-emerald-500/20" : "border-amber-400/20",
            )}>
                <div className="flex items-center gap-3">
                    {active.ready ? <ShieldCheck className="h-5 w-5 text-emerald-400" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                    <div>
                        <p className="text-sm text-white">
                            {view.issuing_from === "none"
                                ? "La facturación todavía no está lista"
                                : `Facturando en ${ENV_LABEL[view.active_environment]}`}
                        </p>
                        <p className="text-xs text-white/50">
                            {view.issuing_from === "settings" && "Con la configuración de esta pantalla."}
                            {view.issuing_from === "env" && "Con las variables ARCA_* del servidor. Importalas acá para administrarlas desde el sistema."}
                            {view.issuing_from === "none" && "Completá los pasos de abajo. Empezá siempre por homologación."}
                        </p>
                    </div>
                </div>
                {view.issuing_from === "env" && view.env_import_available && view.master_key && (
                    <button onClick={() => run({ action: "import_env" }, "import_env")} disabled={busy !== null} className={secondaryButton}>
                        {busy === "import_env" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Importar configuración actual
                    </button>
                )}
            </div>

            {!view.master_key && (
                <p className="rounded-lg border border-red-400/20 px-4 py-3 text-xs text-red-300">
                    Falta la variable <code>INVOICING_ENCRYPTION_KEY</code> en el servidor. Es la clave maestra con la que se cifran las claves privadas: sin ella no se pueden generar ni guardar credenciales. Generala con <code>openssl rand -base64 32</code> y cargala en Vercel (y en <code>.env.local</code>).
                </p>
            )}

            {message && (
                <p className={cn(
                    "rounded-lg border px-4 py-2 text-sm",
                    message.ok ? "border-emerald-400/20 text-emerald-300" : "border-red-400/20 text-red-300",
                )}>
                    {message.text}
                </p>
            )}

            {/* Emisor */}
            <Section title="1. Datos del emisor" description="Salen impresos en cada factura. El CUIT y la condición deben coincidir con tu inscripción en ARCA.">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-xs text-white/50">CUIT</span>
                        <input
                            className={inputClass}
                            inputMode="numeric"
                            placeholder="20-12345678-6"
                            value={issuerForm.tax_id ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, tax_id: e.target.value })}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs text-white/50">Condición frente al IVA</span>
                        <select
                            className={inputClass}
                            value={issuerForm.issuer_condition ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, issuer_condition: e.target.value })}
                        >
                            <option value="" className="bg-[#1a1a1a]">Elegí una opción</option>
                            <option value="monotributo" className="bg-[#1a1a1a]">Responsable Monotributo (Factura C)</option>
                            <option value="exento" className="bg-[#1a1a1a]">IVA Exento (Factura C)</option>
                            <option value="no_alcanzado" className="bg-[#1a1a1a]">IVA No Alcanzado (Factura C)</option>
                        </select>
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="mb-1.5 block text-xs text-white/50">Razón social (como figura en ARCA)</span>
                        <input
                            className={inputClass}
                            value={issuerForm.issuer_name ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, issuer_name: e.target.value })}
                        />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className="mb-1.5 block text-xs text-white/50">Domicilio comercial</span>
                        <input
                            className={inputClass}
                            placeholder="Calle 123 - Ciudad, Provincia"
                            value={issuerForm.issuer_address ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, issuer_address: e.target.value })}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs text-white/50">Ingresos Brutos</span>
                        <input
                            className={inputClass}
                            value={issuerForm.issuer_gross_income ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, issuer_gross_income: e.target.value })}
                        />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-xs text-white/50">Inicio de actividades</span>
                        <input
                            type="date"
                            className={cn(inputClass, "[color-scheme:dark]")}
                            value={issuerForm.issuer_activity_start ?? ""}
                            onChange={(e) => setIssuerForm({ ...issuerForm, issuer_activity_start: e.target.value })}
                        />
                    </label>
                </div>
                <div className="mt-4 flex justify-end">
                    <button onClick={saveIssuer} disabled={busy !== null} className={primaryButton}>
                        {busy === "issuer" && <Loader2 className="h-4 w-4 animate-spin" />}
                        Guardar datos del emisor
                    </button>
                </div>
            </Section>

            {/* Credenciales */}
            <Section
                title="2. Credenciales de ARCA"
                description="Homologación y producción tienen certificados y puntos de venta separados. Configurá y probá homologación primero."
            >
                <div className="mb-5 grid grid-cols-2 gap-2">
                    {(["test", "production"] as const).map((value) => (
                        <button
                            key={value}
                            onClick={() => setEnvironment(value)}
                            className={cn(
                                "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                                environment === value ? "border-white/30 bg-white/[0.06] text-white" : "border-white/10 text-white/50 hover:bg-white/[0.04]",
                            )}
                        >
                            {ENV_LABEL[value]}
                            {view.environments[value].ready && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                        </button>
                    ))}
                </div>

                {env.problems.length > 0 && (
                    <ul className="mb-4 space-y-1 rounded-lg border border-amber-400/20 px-3 py-2 text-xs text-amber-300">
                        {env.problems.map((problem) => <li key={problem}>{problem}</li>)}
                    </ul>
                )}

                <Step index={1} title="Clave privada y pedido de certificado (CSR)" done={env.has_private_key}>
                    {env.has_private_key ? (
                        <p>
                            Clave privada guardada cifrada{env.key_created_at ? ` el ${env.key_created_at.slice(0, 10)}` : ""}. Nunca sale del servidor.
                        </p>
                    ) : (
                        <p>El sistema genera la clave privada en el servidor y la guarda cifrada. Vos solo copiás el pedido (CSR) para pegarlo en ARCA.</p>
                    )}
                    {env.csr_pem && !certificateOk && (
                        <div className="space-y-2">
                            <textarea readOnly value={env.csr_pem} rows={5} className={cn(inputClass, "font-mono text-[11px]")} />
                            <button onClick={copyCsr} className={secondaryButton}>
                                <Copy className="h-3.5 w-3.5" />
                                {copied ? "Copiado" : "Copiar pedido (CSR)"}
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => {
                            if (env.has_private_key && !window.confirm(
                                "Generar una clave nueva invalida el certificado actual de este entorno: vas a tener que pedir uno nuevo en ARCA. ¿Seguir?",
                            )) return
                            void run({ action: "generate_csr", environment }, "csr")
                        }}
                        disabled={busy !== null || !issuerSaved || !view.master_key}
                        className={env.has_private_key ? secondaryButton : primaryButton}
                    >
                        {busy === "csr" && <Loader2 className="h-4 w-4 animate-spin" />}
                        {env.has_private_key ? "Generar clave nueva" : "Generar clave y pedido"}
                    </button>
                    {!issuerSaved && <p className="text-amber-300">Guardá primero el CUIT y la condición del emisor.</p>}
                </Step>

                <Step index={2} title="Certificado emitido por ARCA" done={certificateOk}>
                    {environment === "test" ? (
                        <ol className="list-decimal space-y-1 pl-4">
                            <li>Entrá con clave fiscal a ARCA y abrí <b>WSASS - Autogestión Certificados Homologación</b>. Si no aparece: Administrador de Relaciones → Adherir Servicio → ARCA → Servicios Interactivos → WSASS, y volvé a entrar.</li>
                            <li><b>Nuevo Certificado</b>: elegí un nombre (por ejemplo <code>quepiaTest</code>), pegá el pedido (CSR) y tocá <b>Crear DN y Obtener Certificado</b>.</li>
                            <li>Copiá el certificado que aparece en el cuadro de resultado, de <code>-----BEGIN CERTIFICATE-----</code> a <code>-----END CERTIFICATE-----</code>, y pegalo acá.</li>
                        </ol>
                    ) : (
                        <ol className="list-decimal space-y-1 pl-4">
                            <li>Entrá con clave fiscal a ARCA y abrí <b>Administración de Certificados Digitales</b>. Si no aparece: Administrador de Relaciones → Nueva Relación → Servicios Interactivos → Administración de Certificados Digitales.</li>
                            <li><b>Agregar alias</b>: un nombre (por ejemplo <code>quepia</code>) y el pedido (CSR) guardado como archivo <code>.csr</code>. También podés pegarlo en un editor y guardarlo con esa extensión.</li>
                            <li>En el alias, <b>Ver</b> → <b>Descargar</b> el certificado. Abrilo con un editor de texto y pegá su contenido acá.</li>
                        </ol>
                    )}
                    {env.certificate && (
                        <p className={cn(env.certificate.matches_key ? "text-emerald-300" : "text-amber-300")}>
                            Certificado de CUIT {env.certificate.taxId ?? "desconocido"} ({env.certificate.commonName}), vence el {env.certificate.notAfter.slice(0, 10)}
                            {env.certificate.matches_key === false && " · no corresponde a la clave guardada"}.
                        </p>
                    )}
                    {!certificateOk && (
                        <>
                            <textarea
                                rows={4}
                                placeholder="-----BEGIN CERTIFICATE-----"
                                value={certificateText}
                                onChange={(e) => setCertificateText(e.target.value)}
                                className={cn(inputClass, "font-mono text-[11px]")}
                            />
                            <button
                                onClick={() => run({ action: "save_certificate", environment, certificate_pem: certificateText }, "cert")
                                    .then((ok) => { if (ok) setCertificateText("") })}
                                disabled={busy !== null || !env.has_private_key || certificateText.trim().length < 100}
                                className={primaryButton}
                            >
                                {busy === "cert" && <Loader2 className="h-4 w-4 animate-spin" />}
                                Verificar y guardar certificado
                            </button>
                        </>
                    )}
                </Step>

                <Step index={3} title="Autorizar el certificado en ARCA" done={certificateOk && env.sales_point !== null}>
                    {environment === "test" ? (
                        <p>En WSASS, <b>Crear autorización a servicio</b> con el nombre del paso 2, tu CUIT como representado y el servicio <b>wsfe - Facturación Electrónica</b>. Repetilo con <b>ws_sr_constancia_inscripcion</b> para completar datos de clientes con CUIT.</p>
                    ) : (
                        <p>En <b>Administrador de Relaciones</b> → Nueva Relación: servicio <b>Webservices → Facturación Electrónica</b>, representante el alias del paso 2 (computador fiscal), Confirmar. Recomendado: otra relación con <b>Consulta de Constancia de Inscripción</b>.</p>
                    )}
                    <p>ARCA no avisa al sistema cuando autorizás: usá <b>Probar conexión</b> en el paso siguiente para verificarlo.</p>
                </Step>

                <Step index={4} title="Punto de venta y prueba de conexión" done={env.ready}>
                    {environment === "production" && (
                        <p>
                            Creá un punto de venta nuevo en <b>Administración de Puntos de Venta y Domicilios</b> con el sistema <b>Factura Electrónica – Monotributo – Web Services</b>. No uses el de &quot;Comprobantes en línea&quot;: son sistemas distintos y la numeración se cruzaría.
                        </p>
                    )}
                    <div className="flex flex-wrap items-end gap-2">
                        <label className="block w-40">
                            <span className="mb-1.5 block text-white/50">Número de punto de venta</span>
                            <input
                                className={inputClass}
                                inputMode="numeric"
                                placeholder={environment === "test" ? "1" : "3"}
                                value={salesPointText}
                                onChange={(e) => setSalesPointText(e.target.value.replace(/\D/g, ""))}
                            />
                        </label>
                        <button
                            onClick={() => run({ action: "save_sales_point", environment, sales_point: Number(salesPointText) }, "pv")}
                            disabled={busy !== null || !salesPointText || Number(salesPointText) === env.sales_point}
                            className={secondaryButton}
                        >
                            {busy === "pv" && <Loader2 className="h-4 w-4 animate-spin" />}
                            Guardar
                        </button>
                        <button
                            onClick={() => run({ action: "test_connection", environment }, "test")}
                            disabled={busy !== null || !certificateOk}
                            className={secondaryButton}
                        >
                            {busy === "test" && <Loader2 className="h-4 w-4 animate-spin" />}
                            Probar conexión con ARCA
                        </button>
                    </div>
                    {salesPoints && salesPoints.length > 0 && (
                        <ul className="space-y-1">
                            {salesPoints.map((point) => (
                                <li key={point.number} className="flex items-center gap-2">
                                    <button
                                        onClick={() => setSalesPointText(String(point.number))}
                                        disabled={point.blocked || point.deleted}
                                        className="tabular-nums text-white/80 underline-offset-2 hover:underline disabled:text-white/30 disabled:no-underline"
                                    >
                                        {String(point.number).padStart(5, "0")}
                                    </button>
                                    <span className="text-white/40">
                                        {point.emission_type ?? ""}{point.blocked ? " · bloqueado" : ""}{point.deleted ? " · dado de baja" : ""}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Step>

                <details className="rounded-lg border border-white/[0.06] px-3 py-2">
                    <summary className="cursor-pointer text-xs text-white/50">Ya tengo una clave y un certificado (importar)</summary>
                    <div className="mt-3 space-y-2">
                        <p className="text-xs text-white/50">
                            Por ejemplo, los archivos <code>arca-test.key</code> y <code>arca-test.crt</code> que generó <code>npx facturas init</code>. La clave se cifra en el servidor apenas llega y no se vuelve a mostrar. Después borrá los archivos de tu computadora.
                        </p>
                        <textarea rows={3} placeholder="-----BEGIN PRIVATE KEY-----" value={importKey} onChange={(e) => setImportKey(e.target.value)} className={cn(inputClass, "font-mono text-[11px]")} />
                        <textarea rows={3} placeholder="-----BEGIN CERTIFICATE----- (opcional)" value={importCert} onChange={(e) => setImportCert(e.target.value)} className={cn(inputClass, "font-mono text-[11px]")} />
                        <button
                            onClick={() => {
                                if (env.has_private_key && !window.confirm("Esto reemplaza la clave y el certificado guardados de este entorno. ¿Seguir?")) return
                                void run({
                                    action: "import_key",
                                    environment,
                                    private_key_pem: importKey,
                                    ...(importCert.trim() ? { certificate_pem: importCert } : {}),
                                }, "import").then((ok) => { if (ok) { setImportKey(""); setImportCert("") } })
                            }}
                            disabled={busy !== null || importKey.trim().length < 100 || !view.master_key}
                            className={secondaryButton}
                        >
                            {busy === "import" && <Loader2 className="h-4 w-4 animate-spin" />}
                            Importar en {ENV_LABEL[environment]}
                        </button>
                    </div>
                </details>
            </Section>

            {/* Entorno activo */}
            <Section title="3. Entorno activo" description="Define con qué credenciales se emite desde Pagos y desde Claude.">
                <div className="grid gap-2 sm:grid-cols-2">
                    {(["test", "production"] as const).map((value) => {
                        const selected = view.active_environment === value
                        const ready = view.environments[value].ready
                        return (
                            <button
                                key={value}
                                disabled={busy !== null || selected || (value === "production" && !ready)}
                                onClick={() => {
                                    if (value === "production" && !window.confirm(
                                        "Desde ahora cada factura y nota de crédito será un comprobante fiscal real ante ARCA y no se podrá borrar. ¿Activar producción?",
                                    )) return
                                    void run({ action: "set_environment", environment: value }, "env")
                                }}
                                className={cn(
                                    "rounded-lg border px-4 py-3 text-left transition-colors disabled:cursor-default",
                                    selected ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-white/10 hover:bg-white/[0.04] disabled:opacity-40",
                                )}
                            >
                                <p className="text-sm text-white">{ENV_LABEL[value]}{selected && " · activo"}</p>
                                <p className="mt-1 text-xs text-white/50">
                                    {value === "test"
                                        ? "Comprobantes de prueba, sin validez fiscal. Para practicar sin riesgo."
                                        : ready ? "Comprobantes reales ante ARCA." : "Completá las credenciales de producción para activarlo."}
                                </p>
                            </button>
                        )
                    })}
                </div>
            </Section>

            {/* Guía */}
            <Section title="Guía y recomendaciones">
                <Guide title="¿Qué hace falta para facturar desde el sistema?">
                    <p>ARCA exige cuatro cosas para emitir por web service: tu <b>CUIT</b> y condición, un <b>certificado digital</b> con su clave privada, que ese certificado esté <b>autorizado</b> al servicio de Facturación Electrónica (wsfe) y un <b>punto de venta</b> de tipo Web Services. Esta pantalla te guía por cada una, primero en homologación (prueba) y después en producción.</p>
                </Guide>
                <Guide title="Orden recomendado">
                    <ol className="list-decimal space-y-1 pl-4">
                        <li>Datos del emisor.</li>
                        <li>Homologación: clave y pedido, certificado en WSASS, autorizaciones, punto de venta 1, probar conexión.</li>
                        <li>Emitir una factura de prueba desde Pagos, revisar el PDF y hacer una nota de crédito de prueba.</li>
                        <li>Producción: clave y pedido nuevos, certificado en Administración de Certificados Digitales, relación con Facturación Electrónica, punto de venta Web Services nuevo, probar conexión.</li>
                        <li>Activar producción y emitir la primera factura real sobre un cobro real, revisando bien los datos.</li>
                    </ol>
                </Guide>
                <Guide title="Seguridad de las credenciales">
                    <ul className="list-disc space-y-1 pl-4">
                        <li>La clave privada se genera en el servidor y se guarda cifrada con AES-256-GCM. La base de datos solo tiene el texto cifrado; la clave maestra (<code>INVOICING_ENCRYPTION_KEY</code>) vive solo en el servidor.</li>
                        <li>Guardá una copia de la clave maestra en un gestor de contraseñas. Si se pierde, las claves guardadas no se pueden recuperar y hay que generar certificados nuevos (no afecta facturas ya emitidas).</li>
                        <li>No uses el mismo certificado en otras herramientas (como el CLI <code>npx facturas</code>): ARCA no entrega una sesión nueva mientras otra está abierta y el sistema podría quedar bloqueado hasta 12 horas.</li>
                        <li>Si importaste archivos <code>.key</code>, borralos de tu computadora después.</li>
                    </ul>
                </Guide>
                <Guide title="Puntos de venta">
                    <p>Usá un punto de venta <b>exclusivo</b> para el sistema, de tipo Web Services. El de &quot;Comprobantes en línea&quot; que usás a mano no sirve y mezclaría la numeración. Cada punto de venta tiene su numeración propia, que el sistema y ARCA llevan solos.</p>
                    <p>En homologación ARCA no exige crear el punto de venta: cualquier número funciona.</p>
                </Guide>
                <Guide title="Vencimiento del certificado">
                    <p>Los certificados de ARCA duran dos años. Esta pantalla avisa 30 días antes. Para renovar: <b>Generar clave nueva</b>, pedir el certificado otra vez en ARCA para el mismo alias (en WSASS, &quot;Agregar certificado a alias&quot;) y pegarlo acá. Las autorizaciones están ligadas al alias, así que normalmente se mantienen; después de renovar, confirmalo con <b>Probar conexión</b>.</p>
                </Guide>
                <Guide title="Correcciones y anulaciones">
                    <p>ARCA no anula facturas. Si una factura sale con un error, emití una <b>nota de crédito</b> desde su diálogo en Pagos (total o parcial) y, si corresponde, una factura nueva con los datos correctos. Tanto la factura como la nota quedan registradas en ARCA.</p>
                </Guide>
                <Guide title="Consumidor final y montos altos">
                    <p>Hasta cierto monto podés facturar a consumidor final sin documento. Por encima del umbral vigente (RG 5866/2026: ARS 10.000.000), ARCA exige CUIT o DNI del comprador; el sistema lo controla antes de enviar. Si el cliente te pide CUIT para deducir, facturale con sus datos fiscales.</p>
                </Guide>
            </Section>
        </div>
    )
}
