# Decisiones verificadas para la implementación MCP

Estado: obligatorio para el MVP. Este documento registra las correcciones
derivadas de contrastar el plan con el repositorio y el proyecto Supabase vivo.
No sustituye las migraciones ni habilita producción.

## Bloqueos y decisiones

1. **El drift de migraciones bloquea cualquier despliegue.** Las migraciones
   locales `054–077` no coinciden con el historial remoto y existe un prefijo
   `055` duplicado. Antes de aplicar el control plane hay que obtener un snapshot,
   reconciliar objetos/versiones y validar un staging creado desde cero.
2. **El filtro de `record_state` alcanza al menos once RPCs**, no cinco:
   `get_account_movements`, `get_accounting_accounts`,
   `get_accounting_expenses`, `get_accounting_expenses_v2`,
   `get_accounting_monthly_chart`, `get_accounting_payments`,
   `get_accounting_summary`, `get_expense_analytics`,
   `get_expense_distribution`, `get_history_summary` y
   `get_unified_history`. La implementación debe descubrir dependencias y probar
   todos los reportes/saldos.
3. **`superadmin` queda fuera del MVP.** El código y las policies contienen
   comparaciones exactas con `admin`; agregar un valor nuevo sin migración de
   compatibilidad rompe autorizaciones existentes. El piloto usa `admin` más
   grants MCP explícitos.
4. **OAuth usa `client_id` y una audiencia de recurso.** Supabase incluye
   `client_id`, `session_id` y `aal` en el JWT OAuth. Un Custom Access Token Hook
   debe fijar `aud` al recurso MCP según `client_id`. Staging debe probar PKCE,
   `resource`, audiencia, refresh rotation, revocación y respuestas `2xx` del
   token endpoint.
5. **La aprobación humana es un evento separado.** El hash del payload prueba
   integridad, no intención humana. La web llama únicamente
   `mcp_accounting_approve_expense`; nunca ejecuta
   `mcp_accounting_commit_expense`. El nonce de aprobación se genera del lado
   servidor por un RPC web AAL2, tiene alta entropía, es de un solo uso y no
   vuelve al navegador.
6. **Auditoría de éxitos y fallos usa caminos distintos.** Un cambio exitoso y
   su audit log se confirman en la misma transacción. Un intento rechazado o una
   transacción revertida se registra después del rollback o en logging
   estructurado; no puede depender de una fila que será revertida.
7. **Las migraciones son deterministas, no silenciosamente idempotentes.** Deben
   fallar ante objetos incompatibles, usar expand/backfill/validate/contract,
   definir timeouts y acompañarse con rollback o runbook según el riesgo. No se
   aplica `IF NOT EXISTS` o `DROP IF EXISTS` como regla general.
8. **Gate del SDK MCP.** Antes de construir/publicar el servicio se verifica la
   versión estable vigente. Al 26 de julio de 2026, v1 es la rama de producción
   y v2 sigue en beta con estabilización prevista para el 28 de julio.

## Contrato web acordado

- Todos los RPC públicos reciben un único argumento `p_request jsonb`.
- Todos devuelven `{ "ok": boolean, "data": ..., "error": ... }`.
- La página
  `/sistema/mcp/approvals/[operationId]` obtiene la operación exclusivamente con
  `mcp_accounting_get_operation`.
- El RPC de lectura devuelve como mínimo `operation_id`, `operation_type`,
  `normalized_payload`, `payload_hash`, `risk_level`, `expires_at`, `status` y
  opcionalmente `requires_aal2`.
- El endpoint web compara el hash visto con una lectura fresca, solicita a
  `mcp_accounting_get_operation` un challenge AAL2 de un solo uso y llama
  `mcp_accounting_approve_expense`. Postgres guarda solo el hash del nonce.
- Toda aprobación financiera del MVP requiere AAL2 tanto en el servidor web
  como en la base, sin rebajar el requisito para riesgo 2. La UI nunca simula
  una aprobación ante AAL desconocido o insuficiente.
- El endpoint exige sesión real (`auth.getUser()`), JSON, Origin permitido,
  `Sec-Fetch-Site` compatible, body acotado y respuestas `no-store`.
- Ningún helper o página usa `service_role`.

## Panel de conexiones

`mcp_get_context(p_request jsonb)` está diseñado para el JWT OAuth del cliente
MCP y valida `user_id`, `client_id` y `session_id`. Una sesión web convencional
no debe suplantarlo.

Hasta contar con un RPC web dedicado para listar/revocar grants y conexiones,
`/sistema/mcp` muestra un estado explícitamente incompleto y no consulta tablas
privadas de forma directa.

## Módulo de tareas (2026-07-27)

- **Cuatro capacidades, no una.** `tasks.read`, `tasks.write`,
  `tasks.structure.write` y `tasks.notify`. Separar estructura y aviso permite
  dar control del tablero sin dar control de los proyectos, y viceversa. Las
  cuatro entran por `granted_by_default`, así que los clientes ya autorizados no
  se reconectan.
- **El lote es la única escritura masiva.** Todo o nada, un solo proyecto y tope
  en `private.mcp_config.tasks_batch_max`. El error identifica la posición del
  lote que fue rechazada, para que se corrija esa tarea y se reintente con la
  misma `idempotency_key`.
- **Anular necesita más que `entity_id`.** Una operación de tareas toca varias
  filas y algunas de sus escrituras son actualizaciones, no altas. El rastro
  vive en `private.mcp_operation_undo` con tres acciones —borrar lo creado,
  restaurar lo cambiado, reponer lo borrado— y se aplica en orden inverso.
- **La anulación se detiene antes de pisar trabajo ajeno.** Si `updated_at` de
  la tarea es posterior al `committed_at` de la operación, la anulación
  devuelve `undo_superseded` y no cambia nada. Si la columna o el proyecto que
  habría que borrar ya tiene tareas, devuelve `undo_blocked`.
- **La búsqueda pagina por `created_at`, no por el orden del tablero.** El orden
  del tablero cambia cada vez que alguien arrastra una tarjeta, y un cursor
  sobre una clave inestable saltea o repite filas entre páginas.
- **El aviso se queda dentro de la app.** La primera versión encolaba también un
  correo que una ruta de la web vaciaba por cron cada cinco minutos, pero el
  plan Hobby de Vercel solo admite crons diarios y un aviso que puede tardar un
  día no avisa nada. Se eligió el canal que ya era inmediato: comentario y
  notificación en la app se escriben en la misma transacción que la operación y
  se deshacen al anularla. La cola se eliminó en vez de dejarla acumulando datos
  de personas sin consumidor.
- **La pantalla de actividad tolera tipos que no conoce.** Una operación de un
  tipo que esa versión del front no entiende se descarta de la lista en lugar de
  romper la revisión de las demás.

## Referencias normativas

- [Supabase OAuth token security](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [MCP Authorization 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
