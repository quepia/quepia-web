import {
  AlertTriangle,
  Ban,
  Bot,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  Link2,
  ShieldCheck,
} from "lucide-react"
import type {
  McpOAuthClientLifecycle,
  McpOAuthLifecycleSnapshot,
} from "@/lib/mcp/oauth"

const DATE_FORMATTER = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Cordoba",
})

export function OAuthLifecycleList({
  lifecycle,
}: {
  lifecycle: McpOAuthLifecycleSnapshot
}) {
  return (
    <div className="mt-6 space-y-4">
      {!lifecycle.oauthGrantStateAvailable ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-300"
              aria-hidden="true"
            />
            <p className="text-sm leading-6 text-amber-100/75">
              Supabase Auth no permitió consultar sus grants OAuth. El estado
              MCP de abajo sí proviene del RPC seguro. Una revocación seguirá
              intentando invalidar ambos lados y avisará si queda un residual.
            </p>
          </div>
        </div>
      ) : null}

      {lifecycle.clients.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-7 text-center">
          <Link2
            className="mx-auto h-7 w-7 text-white/30"
            aria-hidden="true"
          />
          <h2 className="mt-3 text-sm font-semibold text-white">
            No hay clientes MCP configurados
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/45">
            El RPC no devolvió políticas ni grants para mostrar.
          </p>
        </section>
      ) : (
        lifecycle.clients.map((client) => (
          <OAuthClientCard
            key={client.id}
            client={client}
            oauthGrantStateAvailable={
              lifecycle.oauthGrantStateAvailable
            }
          />
        ))
      )}
    </div>
  )
}

function OAuthClientCard({
  client,
  oauthGrantStateAvailable,
}: {
  client: McpOAuthClientLifecycle
  oauthGrantStateAvailable: boolean
}) {
  const grantState = !client.grant
    ? "Sin grant MCP"
    : client.grant.active
      ? "Grant MCP activo"
      : "Grant MCP vencido"
  const grantTone = client.grant?.active
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
    : "border-white/10 bg-white/[0.04] text-white/55"

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="rounded-xl border border-quepia-cyan/15 bg-quepia-cyan/10 p-2.5 text-quepia-cyan">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-base font-semibold text-white">
                {client.name ?? "Cliente OAuth sin nombre"}
              </h2>
              <p className="mt-1 break-all font-mono text-xs text-white/40">
                {client.id}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${grantTone}`}
            >
              {grantState}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                client.enabled
                  ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-100"
                  : "border-red-500/20 bg-red-500/10 text-red-100"
              }`}
            >
              Política {client.enabled ? "habilitada" : "deshabilitada"}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
              mínimo {client.minAal.toUpperCase()}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <LifecycleDetail
              icon={KeyRound}
              label="Grant OAuth"
              value={
                oauthGrantStateAvailable
                  ? client.oauthGrant
                    ? `Activo desde ${formatDate(client.oauthGrant.grantedAt)}`
                    : "No concedido"
                  : "No verificable"
              }
            />
            <LifecycleDetail
              icon={CalendarClock}
              label="Vencimiento MCP"
              value={
                client.grant
                  ? client.grant.lifetime === "oauth_grant"
                    ? "Sigue el lifecycle del grant OAuth"
                    : client.grant.expiresAt
                      ? formatDate(client.grant.expiresAt)
                      : "No informado"
                  : "Sin grant vigente"
              }
            />
            <LifecycleDetail
              icon={ShieldCheck}
              label="Scopes OAuth"
              value={
                client.oauthGrant
                  ? client.oauthGrant.scopes.join(", ")
                  : "Sin scopes confirmados"
              }
            />
            <LifecycleDetail
              icon={Link2}
              label="Registro"
              value={
                [client.type, client.registrationType]
                  .filter(Boolean)
                  .join(" · ") || "No informado"
              }
            />
          </dl>

          {client.uri ? (
            <p className="mt-4 break-all text-xs text-white/35">
              URI declarada: {client.uri}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 rounded-2xl border border-red-500/15 bg-red-500/[0.05] p-4 lg:w-64">
          <div className="flex items-center gap-2 text-red-100">
            <Ban className="h-4 w-4" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Cortar acceso</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-red-100/55">
            Invalida el grant OAuth, sus sesiones y refresh tokens, y siempre
            intenta además revocar tu grant MCP y cortar conexiones activas.
          </p>
          <form
            action="/api/mcp/oauth/revoke"
            method="post"
            className="mt-4"
          >
            <input type="hidden" name="client_id" value={client.id} />
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 transition-colors hover:bg-red-500/25"
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Revocar acceso
            </button>
          </form>
        </div>
      </div>

      {client.grant?.active && client.oauthGrant ? (
        <div className="mt-5 flex items-start gap-2 border-t border-white/10 pt-4 text-xs leading-5 text-emerald-100/65">
          <CheckCircle2
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          El grant MCP y el consentimiento OAuth están activos. Las sesiones de
          conexión individuales no se exponen en este RPC.
        </div>
      ) : null}
    </section>
  )
}

function LifecycleDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof KeyRound
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <dt className="flex items-center gap-2 text-xs text-white/40">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 break-words text-xs leading-5 text-white/70">
        {value}
      </dd>
    </div>
  )
}

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value))
}
