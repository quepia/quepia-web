import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Fingerprint,
  LockKeyhole,
  X,
} from "lucide-react"
import {
  MCP_REQUESTED_CAPABILITIES,
  type OAuthAuthorizationDetails,
} from "@/lib/mcp/oauth"

export function OAuthConsentCard({
  details,
  errorMessage,
}: {
  details: OAuthAuthorizationDetails
  errorMessage: string | null
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="flex items-start gap-4 border-b border-white/10 pb-6">
          <div className="rounded-2xl border border-quepia-cyan/20 bg-quepia-cyan/10 p-3 text-quepia-cyan">
            <Bot className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
              Solicita acceso
            </p>
            <h2 className="mt-1 break-words text-xl font-semibold text-white">
              {details.client.name}
            </h2>
            <p className="mt-1 break-all text-xs text-white/45">
              Cliente: {details.client.id}
            </p>
          </div>
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-white">
            Acceso de negocio solicitado
          </h3>
          <p className="mt-1 text-sm leading-6 text-white/50">
            Estas capacidades se validan nuevamente en el servidor al
            autorizar. Verlas acá no significa que ya estén concedidas.
          </p>

          <ul className="mt-4 space-y-3">
            {MCP_REQUESTED_CAPABILITIES.map((capability) => (
              <li
                key={capability.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-full bg-quepia-cyan/10 p-1 text-quepia-cyan">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {capability.label}
                    </p>
                    <p className="mt-1 text-xs font-mono text-white/40">
                      {capability.id}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      {capability.description}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.07] p-4 text-sm leading-6 text-amber-100/80">
          Esta conexión no habilita acceso directo a tablas ni aprueba gastos
          automáticamente. Las escrituras sensibles conservan su aprobación
          humana de un solo uso.
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <form action="/api/oauth/decision" method="post">
            <input
              type="hidden"
              name="authorization_id"
              value={details.authorizationId}
            />
            <button
              type="submit"
              name="decision"
              value="deny"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white/70 transition-colors hover:border-white/30 hover:bg-white/[0.06] hover:text-white sm:w-auto"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Rechazar
            </button>
          </form>

          <form action="/api/oauth/decision" method="post">
            <input
              type="hidden"
              name="authorization_id"
              value={details.authorizationId}
            />
            <button
              type="submit"
              name="decision"
              value="approve"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-quepia-purple to-quepia-cyan px-5 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.01] sm:w-auto"
            >
              Autorizar conexión
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      <aside className="space-y-4">
        <InfoCard
          icon={Fingerprint}
          title="Identidad solicitada"
          items={details.scopes}
          footer={`Sesión: ${details.user.email}`}
        />

        <InfoCard
          icon={ExternalLink}
          title="Retorno registrado"
          footer={details.redirectUri}
        />

        <InfoCard
          icon={LockKeyhole}
          title="Protección activa"
          footer="La sesión web directa y el rol de administrador global se revalidan por RPC al confirmar. AAL2 queda reservado para aprobar gastos."
        />
      </aside>
    </div>
  )
}

function InfoCard({
  icon: Icon,
  title,
  items,
  footer,
}: {
  icon: typeof Fingerprint
  title: string
  items?: readonly string[]
  footer: string
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center gap-2 text-white/70">
        <Icon className="h-4 w-4 text-quepia-cyan" aria-hidden="true" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <code
              key={item}
              className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/65"
            >
              {item}
            </code>
          ))}
        </div>
      ) : null}
      <p className="mt-3 break-all text-xs leading-5 text-white/45">
        {footer}
      </p>
    </section>
  )
}
