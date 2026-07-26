"use client"

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react"
import { createClient } from "@/lib/sistema/supabase/client"
import { normalizeInternalRedirect } from "@/lib/mcp/oauth"

interface TotpFactor {
  id: string
  friendlyName: string
}

interface TotpEnrollment {
  factorId: string
  qrCode: string
  secret: string
}

function MfaContent() {
  const searchParams = useSearchParams()
  const redirectTo = useMemo(
    () =>
      normalizeInternalRedirect(
        searchParams.get("redirectTo"),
        "/sistema/mcp",
      ),
    [searchParams],
  )
  const [supabase] = useState(() => createClient())
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [verifiedFactors, setVerifiedFactors] = useState<TotpFactor[]>([])
  const [unverifiedFactorIds, setUnverifiedFactorIds] = useState<string[]>(
    [],
  )
  const [selectedFactorId, setSelectedFactorId] = useState("")
  const [enrollment, setEnrollment] =
    useState<TotpEnrollment | null>(null)
  const [code, setCode] = useState("")

  useEffect(() => {
    let active = true

    async function loadMfaState() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) return
      if (!user) {
        const loginPath = `/auth/login?redirectTo=${encodeURIComponent(
          `/auth/mfa?redirectTo=${encodeURIComponent(redirectTo)}`,
        )}`
        window.location.replace(loginPath)
        return
      }

      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (!active) return

      if (!aalError && aalData?.currentLevel === "aal2") {
        window.location.replace(redirectTo)
        return
      }

      const { data: factorData, error: factorError } =
        await supabase.auth.mfa.listFactors()
      if (!active) return

      if (factorError || !factorData) {
        setErrorMessage(
          "No se pudieron consultar tus factores. Actualizá la página para volver a intentar.",
        )
        setIsLoading(false)
        return
      }

      const factors = factorData.totp.map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name || "Aplicación autenticadora",
      }))
      setVerifiedFactors(factors)
      setSelectedFactorId(factors[0]?.id ?? "")
      setUnverifiedFactorIds(
        factorData.all
          .filter(
            (factor) =>
              factor.factor_type === "totp" &&
              factor.status === "unverified",
          )
          .map((factor) => factor.id),
      )
      setIsLoading(false)
    }

    void loadMfaState()
    return () => {
      active = false
    }
  }, [redirectTo, supabase])

  async function handleEnroll() {
    setIsBusy(true)
    setErrorMessage(null)

    for (const factorId of unverifiedFactorIds) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) {
        setErrorMessage(
          "Existe una configuración TOTP incompleta que no se pudo reemplazar.",
        )
        setIsBusy(false)
        return
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Quepia MCP",
      issuer: "Quepia",
    })

    if (error || !data || data.type !== "totp") {
      setErrorMessage(
        "No se pudo iniciar el enrolamiento TOTP. Verificá que MFA esté habilitado en Supabase.",
      )
      setIsBusy(false)
      return
    }

    setEnrollment({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    })
    setSelectedFactorId(data.id)
    setUnverifiedFactorIds([])
    setCode("")
    setIsBusy(false)
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedCode = code.replace(/\s+/g, "")
    if (!/^\d{6}$/.test(normalizedCode) || !selectedFactorId) {
      setErrorMessage("Ingresá el código TOTP de 6 dígitos.")
      return
    }

    setIsBusy(true)
    setErrorMessage(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: selectedFactorId,
      code: normalizedCode,
    })

    if (error) {
      setErrorMessage(
        "El código no pudo verificarse. Esperá el próximo código e intentá nuevamente.",
      )
      setCode("")
      setIsBusy(false)
      return
    }

    const { data: aalData, error: aalError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aalError || aalData?.currentLevel !== "aal2") {
      setErrorMessage(
        "El factor se verificó, pero la sesión todavía no alcanzó AAL2. Iniciá sesión nuevamente.",
      )
      setIsBusy(false)
      return
    }

    window.location.replace(redirectTo)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090909] px-4 py-10 text-white sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(circle at 25% 5%, rgba(42,231,228,0.14), transparent 36%), radial-gradient(circle at 85% 20%, rgba(136,16,120,0.2), transparent 32%)",
        }}
      />

      <div className="relative mx-auto max-w-xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/sistema/mcp"
            className="text-sm text-white/50 transition-colors hover:text-white"
          >
            Cancelar
          </Link>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/65">
            <ShieldCheck
              className="h-3.5 w-3.5 text-quepia-cyan"
              aria-hidden="true"
            />
            AAL2
          </span>
        </div>

        <header className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-quepia-cyan">
            Verificación multifactor
          </p>
          <h1 className="mt-3 font-display text-3xl font-light tracking-tight sm:text-4xl">
            Protegé la autorización
          </h1>
          <p className="mt-4 text-sm leading-6 text-white/55">
            La conexión MCP requiere un segundo factor real. Quepia no
            permite omitir ni simular esta verificación.
          </p>
        </header>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 sm:p-7">
          {isLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-3 text-sm text-white/55">
              <Loader2
                className="h-5 w-5 animate-spin text-quepia-cyan"
                aria-hidden="true"
              />
              Comprobando factores…
            </div>
          ) : (
            <>
              {errorMessage ? (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
                >
                  {errorMessage}
                </div>
              ) : null}

              {verifiedFactors.length > 0 && !enrollment ? (
                <div>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-quepia-cyan/10 p-2 text-quepia-cyan">
                      <KeyRound className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">
                        Confirmá con tu autenticador
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-white/50">
                        Usá un factor TOTP ya verificado para elevar esta
                        sesión.
                      </p>
                    </div>
                  </div>

                  {verifiedFactors.length > 1 ? (
                    <label className="mt-5 block text-sm text-white/65">
                      Factor
                      <select
                        value={selectedFactorId}
                        onChange={(event) =>
                          setSelectedFactorId(event.target.value)
                        }
                        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-quepia-cyan"
                      >
                        {verifiedFactors.map((factor) => (
                          <option key={factor.id} value={factor.id}>
                            {factor.friendlyName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}

              {verifiedFactors.length === 0 && !enrollment ? (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-quepia-cyan/10 text-quepia-cyan">
                    <Smartphone className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">
                    Configurá una aplicación autenticadora
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-white/50">
                    Podés usar 1Password, Google Authenticator, Authy u otra
                    aplicación compatible con TOTP.
                  </p>
                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={isBusy}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-quepia-purple to-quepia-cyan px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <QrCode className="h-4 w-4" aria-hidden="true" />
                    )}
                    Generar código QR
                  </button>
                </div>
              ) : null}

              {enrollment ? (
                <div>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-quepia-cyan/10 p-2 text-quepia-cyan">
                      <QrCode className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold">
                        Escaneá el código
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-white/50">
                        Después ingresá el código de seis dígitos para activar
                        el factor.
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-center rounded-2xl bg-white p-4">
                    {/* El SVG data URL proviene directamente del endpoint MFA de Supabase. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={enrollment.qrCode}
                      alt="Código QR para configurar TOTP"
                      width={224}
                      height={224}
                      className="h-56 w-56"
                    />
                  </div>

                  <label className="mt-4 block text-xs text-white/50">
                    Clave manual
                    <input
                      readOnly
                      value={enrollment.secret}
                      className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/25 px-3 font-mono text-xs text-white/75"
                    />
                  </label>
                </div>
              ) : null}

              {(verifiedFactors.length > 0 || enrollment) ? (
                <form onSubmit={handleVerify} className="mt-6">
                  <label
                    htmlFor="totp-code"
                    className="block text-sm font-medium text-white/75"
                  >
                    Código TOTP
                  </label>
                  <input
                    id="totp-code"
                    name="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, ""))
                    }
                    placeholder="000000"
                    className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-center font-mono text-xl tracking-[0.4em] text-white outline-none focus:border-quepia-cyan"
                  />
                  <button
                    type="submit"
                    disabled={isBusy || code.length !== 6}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-quepia-purple to-quepia-cyan px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isBusy ? (
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : enrollment ? (
                      <CheckCircle2
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight
                        className="h-4 w-4"
                        aria-hidden="true"
                      />
                    )}
                    {enrollment
                      ? "Activar y continuar"
                      : "Verificar y continuar"}
                  </button>
                </form>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

export default function MfaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#090909] text-white">
          <Loader2
            className="h-7 w-7 animate-spin text-quepia-cyan"
            aria-label="Cargando"
          />
        </main>
      }
    >
      <MfaContent />
    </Suspense>
  )
}
