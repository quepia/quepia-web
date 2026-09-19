# Gestión social con Zernio — registro de implementación

Fecha: 18 de septiembre de 2026 · Rama: `feat/social-admin-module` · Especificación: `docs/zernio-modulo-gestion-social.md`.

Estado: implementación de código **cerrada y probada en local** (PGlite + stack compatible + Zernio simulado + Vertex real con datos sintéticos). Una auditoría independiente posterior corrigió el conteo real de bytes UTF-8 en APIs/webhooks, documentó las variables nuevas y dejó el código propio del módulo sin errores ni advertencias de lint. **Actualización 18/09/2026:** con autorización explícita se aplicaron en producción **solo las 6 migraciones sociales** (vía Management API con `scripts/social/apply-social-migrations.mjs`, registradas en el historial como `social_*`), sin `db push` porque el historial remoto diverge. No se crearon webhooks ni automatizaciones en Zernio y no se enviaron mensajes reales.

## 1. Revalidación del diagnóstico (18/09/2026)

| Hallazgo del documento | Resultado |
|---|---|
| Supabase: 6 proyectos, `clients` vacía, 3 perfiles, 3 cuentas, 9 publicaciones | Confirmado (publicaciones: 5 `scheduled`, 4 `publishing`). Postgres 17.6. Sin `pg_cron`/`pg_net`. |
| 3 cuentas locales vs 2 en `/accounts` | **Explicado**: `@quepiastudio` (perfil del proyecto Quepia) ya no existe en Zernio (el perfil está vacío), pero sigue `is_active=true` localmente porque la sincronización solo corría al abrir la pantalla. Además Zernio tiene un perfil `Default` sin uso. |
| `/usage.connectedAccounts = 0` con 2 cuentas | Sigue sin explicación (no se infirió causa). |
| Credencial desplegada = local | **No verificado** (no se leyeron secretos de Vercel). |
| `getQuepiaSession()` no revisa `is_authorized` | Confirmado. El módulo no lo usa: `lib/social/auth.ts` exige `role=admin`, `is_authorized`, `is_active`, sin `deleted_at`, identidad/correo coincidentes y rechaza tokens OAuth. |
| `syncProjectAccounts()` desactiva antes del upsert | Confirmado y **corregido**: usa la RPC atómica `social_reconcile_profile_accounts` (con respaldo al comportamiento previo si la migración no está aplicada). |
| Plan Vercel solo permite crons diarios | Confirmado en `docs/mcp/IMPLEMENTATION_DECISIONS.md`. |

## 2. Contratos de Zernio verificados

Fuente: `docs.zernio.com/llms.txt` y páginas `.mdx` (webhooks, delta, analytics, timeline, daily-metrics, follower-stats, IG insights, conversaciones, mensajes, comentarios, respuesta privada, comment-automations, idempotencia, límites, response-time, health). GET acotados con la credencial local:

| Punto | Evidencia |
|---|---|
| Timeline de post | **Acumulado** por día (serie monótona; último valor = total). Nunca se suman filas. |
| Ceros | `/analytics` y el delta devuelven `0` para métricas no reportadas (p. ej. `completionRate` en IG). Se resuelve con catálogo de soporte por plataforma/formato. |
| `impressions` en IG | Igual a `views` en las 31 publicaciones observadas → alias, no se suma. |
| Delta | Bootstrap sin cursor devuelve página vacía + `nextCursor` (`v1.`); cursor inválido → 400 `invalid_field_value`; el cursor cambia aun en página vacía. |
| Discrepancia `sync.cursor` | La prosa del webhook dice que trae cursor; el esquema del payload y la página del delta dicen que no. **Decisión**: cursor propio; el webhook es solo señal. Falta capturar un payload real (requiere crear el webhook). |
| Página vacía tras `analytics.synced` | Contrato: repetir con el mismo cursor. Implementado: no se avanza si el cursor tiene < 30 min; luego sí, para no vencerlo en cuentas sin cambios. |
| Publicaciones de Quepia | Aparecen como externas con `latePostId` = `sistema_zernio_publications.zernio_post_id` → heredan proyecto/tarea. |
| Idempotencia | `Idempotency-Key` documentado en enviar mensaje y responder comentario; **no** en respuesta privada (una por comentario, 7 días). |
| Automatizaciones | Crear no acepta `isActive`: crear = activar. Por eso Quepia guarda borradores y solo crea tras confirmación con hash. |
| Límites | 60/min general, 6/s analítica (cabeceras reales). |

No se usaron endpoints no documentados. Workflows avanzados, reviews, LinkedIn/TikTok/YouTube específicos: no implementados (sin cuentas para validar).

## 3. Qué se implementó

### Base de datos (6 migraciones, `supabase/migrations/20260918120*_social_*.sql`)
1. **Fundamentos**: `clients` como identidad comercial; `client_id` en proyectos, perfiles y cuentas con FKs compuestas (impiden cruces de cliente); reasignación de cliente bloqueada (no reclasifica histórico); vínculos proyecto–perfil y proyecto–cuenta con vigencia; historial de identidades; auditoría append-only; payloads saneados con retención; webhooks deduplicados; cola durable con leases; estado de sync con cursor; ejecuciones de sync; outbox de acciones externas; RPC de reconciliación atómica, salud, programación periódica, cuarentena.
2. **Analítica**: publicaciones nativas por cuenta (únicas por cuenta + id nativo), atribución a proyecto, catálogo versionado de métricas y soporte por plataforma/formato, valores vigentes (sin retroceso por orden inverso), snapshots diarios, seguidores diarios, insights de cuenta con motivo de ausencia; ingesta y página de delta con checkpoint transaccional (compare-and-swap del cursor).
3. **Capa semántica común** (`public.social_query` → `private.social_query_dispatch`): scopes, definiciones, overview, series (publish/received), comparación de períodos con descomposición volumen/tasa, ranking a igual edad, formatos (mediana/cuartiles), detalle de post, cobertura, atención. Valida y rechaza parámetros desconocidos o cruzados; devuelve evidencia (hash de consulta, período, zona, versiones de definiciones, frescura).
4. **Bandeja**: hilos DM/comentario, interacciones deduplicadas, origen (contacto / admin Quepia / automatización / humano en Zernio / desconocido), asignaciones solo a admins globales, notas internas, episodios de atención (SLA humano y automático separados, horario laboral configurable), versión optimista, claim, outbox idempotente, envío ambiguo con conciliación, revocación antes de acciones diferidas, historial importado sin carga de SLA.
5. **Automatizaciones**: borradores versionados con hash, validación del contrato, conflictos (bloqueante por publicación, advertencia por palabras), activación/pausa vía outbox, inventario de reglas externas, logs deduplicados, reglas internas (asignación y recordatorio SLA con tope diario).
6. **Inteligencia y MCP**: ejecuciones de análisis, evidencia por consulta, insights con seguimiento; capacidad MCP `social.analytics.read` **no otorgada por defecto** + 10 RPC `mcp_social_*` que además exigen admin global activo/autorizado.

Todas las tablas nuevas: RLS activo, sin grants a `anon`/`authenticated`/`mcp_authenticated`; RPC solo para `service_role` (las `mcp_social_*` solo para `mcp_authenticated`).

### Servidor (`lib/social/`, `app/api/`)
- `auth.ts`/`policy.ts`: admin global por solicitud, rechazo de tokens OAuth, control de origen en mutaciones.
- `zernio-adapter.ts`: timeouts, reintentos acotados solo en GET, `Retry-After`, cabeceras de cuota, `PATCH`, clasificación (402 terminal, envíos ambiguos).
- `normalize.ts`: mapeo puro proveedor → filas; saneamiento (secretos y URLs firmadas fuera).
- `worker.ts`: 14 tipos de trabajo; reserva de cuota para publicación; programación periódica sin duplicar buckets.
- `webhook-receiver.ts`: HMAC sobre cuerpo crudo, dos canales con secretos distintos, persistencia antes del 2xx, procesamiento en `after()`.
- `analysis.ts`/`analysis-guards.ts`: análisis con IA (Vertex `gemini-2.5-flash`, reutiliza `lib/ai/vertex.ts`), herramienta de solo lectura, alcance fijado por el servidor, verificación determinista de cifras.
- 25 rutas bajo `/api/admin/social/*`, `/api/webhooks/zernio/{operations,analytics}`, `/api/internal/social/process`.
- Publicador: solo se cambió `syncProjectAccounts` (reconciliación atómica con respaldo).

### Interfaz (`components/sistema/social/`, ítem “Gestión social” en Negocio, y `/sistema/social`)
Agencia · Analítica · Contenido · Bandeja · Automatizaciones · Análisis con IA · Conexiones. Filtros cliente→proyecto→plataforma→cuenta→período en la URL, con reinicio de selecciones incompatibles.

### MCP (`services/mcp`)
Herramientas `social_list_scopes`, `social_get_metric_definitions`, `social_get_data_coverage`, `social_get_overview`, `social_get_timeseries`, `social_compare_periods`, `social_rank_posts`, `social_get_post_performance`, `social_compare_formats`, `social_get_attention_metrics`. Esquemas estrictos, anotaciones de solo lectura, sin acceso a tablas.

## 4. Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| SQL en PGlite (migraciones reales): fundamentos, analítica, bandeja, automatizaciones, inteligencia/MCP | 56 ✔ |
| Worker contra PGlite + Zernio simulado (bootstrap, delta, vencimiento, webhooks, ambiguo→conciliado, caída de worker, buckets, cuota) | 10 ✔ |
| Análisis con IA (modelo simulado): alcance inamovible, DMs/notas/otro cliente fuera del prompt, cifras fabricadas retiradas | 5 ✔ |
| Unitarias (normalización, adaptador, firma, simulador, política y límites UTF-8) | 14 ✔ |
| MCP service (vitest) incluidas 5 sociales | 85 ✔ |
| Tests existentes (auth, publicación, storage, thumbnails, MCP web) | 72 ✔ |
| HTTP contra Next (dev y build de producción) + stack local: permisos, OAuth, CSRF, webhooks firmados/duplicados/canal, proceso interno | 32 ✔ |
| Navegador: agencia, analítica, contenido y detalle, respuesta DM (despacho real al Zernio simulado, un solo envío), nota interna, simulación y activación de regla, asignación de cliente, análisis con IA real (Vertex) | ✔ |
| Rendimiento: build de producción local p95 69 ms (demo); volumen 4.000 posts/382.000 snapshots en PGlite: todas las consultas < 1 s | ✔ |
| `tsc --noEmit`, `next build`, verificadores MCP | ✔ |
| `eslint .` | 1 error **preexistente** en `services/mcp/src/http-app.ts` (no tocado) + advertencias |

Scripts: `node --import ./scripts/testing/register-ts-hook.mjs --test supabase/tests/social/*.test.mjs lib/social/*.test.mjs`, `scripts/testing/social-local-stack.mjs`, `scripts/testing/social-http-checks.mjs`, `scripts/testing/social-volume-bench.mjs`.

Errores encontrados y corregidos durante las pruebas: caída falsa en la serie de seguidores cuando faltaba el dato de una cuenta (ahora hueco); IA sin salida por tokens de razonamiento de Gemini y límites de esquema; falsos positivos del verificador de cifras (fechas y decimales); título de página que revelaba el módulo; variación de tasas mostrada sin unidad.

## 5. Pasos operativos pendientes (requieren aprobación)

1. **Migraciones**: ✅ aplicadas en producción el 18/09/2026 (solo las 6 sociales, expand-only). Verificado: 31 tablas y 63 RPC sociales, 10 RPC `mcp_social_*`, RLS en todas las tablas, sin grants a `anon`/`authenticated`, `social.analytics.read` deshabilitado por defecto, datos existentes intactos; smoke admin OK y no admin → `forbidden`. Advisors: solo INFO `rls_enabled_no_policy` (intencional, tablas server-only). La reconciliación general del historial (versiones remotas sin archivo local y viceversa) sigue pendiente como tarea separada: no ejecutar `db push --include-all` ni `migration repair` a ciegas.
2. **Variables en Vercel**: `ZERNIO_WEBHOOK_SECRET_OPERATIONS`, `ZERNIO_WEBHOOK_SECRET_ANALYTICS` (≥ 32 caracteres, distintos), `CRON_SECRET` (ya usado por otros crons), opcionales `SOCIAL_AI_DAILY_ANALYSES_PER_ADMIN`, `SOCIAL_AI_USD_PER_MTOK_INPUT/OUTPUT` (sin precios no se informa costo). **No** definir `SOCIAL_ZERNIO_API_BASE` en producción.
3. **Frecuencia**: el cron diario ya está en `vercel.json`. Para 10 min, cargar en GitHub los secretos `SOCIAL_PROCESS_URL` y `CRON_SECRET` (workflow `social-worker.yml`).
4. **Webhooks en Zernio**: `node --env-file=.env.local scripts/social/zernio-webhooks.mjs --base-url https://<dominio>` (simulación) y luego `--apply`. Después capturar un `analytics.synced` real para cerrar la discrepancia del cursor.
5. **Identidad comercial**: en Conexiones, crear clientes y asignar proyectos/perfiles (nada se infiere por nombre). El perfil `Default` y la cuenta `@quepiastudio` quedarán como sin cliente/eliminada.
6. **Carga inicial**: “Carga histórica” (bootstrap 180 días), luego “Evolución de posts” y “Bandeja”.
7. **MCP**: habilitar `social.analytics.read` por grant desde Conexiones; desplegar `services/mcp`.
8. **Automatizaciones reales y envíos**: probar primero con una cuenta de prueba y autorización explícita.

## 6. Limitaciones reales

- Pruebas de base de datos en PGlite con stubs del control plane MCP (la lógica real de `mcp_authorize` no se ejecutó); validar en staging.
- Reconexión de cuentas: usa el flujo existente por proyecto; perfiles de cliente sin proyecto no tienen botón propio de reconexión.
- Bandeja: backfill limitado a 14 días, 20 conversaciones y 15 publicaciones por cuenta y corrida; comentarios de anuncios excluidos; sin adjuntos descargables (se muestran tipos).
- Métricas de redes distintas de Instagram quedan “sin validar” hasta tener cuentas conectadas.
- Workflows de Zernio, reviews de Google Business, respuestas públicas automáticas propias y respuestas con IA: no implementados (fuera del MVP o sin contrato confirmado).
- El 200 con UI 404 en `/sistema/social` para no admins se debe al streaming de `app/sistema/loading.tsx`; la API responde 403.
- Pausar una regla en Zernio no cancela envíos demorados ya iniciados (comportamiento del proveedor).
- `/usage.connectedAccounts = 0` sin explicar; credencial desplegada no verificada.
