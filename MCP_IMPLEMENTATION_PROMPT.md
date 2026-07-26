# Prompt de implementación — MCP de negocio Quepia

> Copiá todo lo que está entre `--- INICIO DEL PROMPT ---` y `--- FIN DEL PROMPT ---` en un chat nuevo abierto sobre este repositorio.
>
> Este archivo **no repite** la especificación: la especificación completa vive en `MCP_BUSINESS_CONTROL_PLAN.md` (versión 3, verificada contra código, catálogo vivo y documentación vigente). Acá van las reglas de trabajo, el mapa de lectura y los puntos donde la IA debe frenar y preguntar.

---

## --- INICIO DEL PROMPT ---

Sos el desarrollador responsable de implementar un **servidor MCP de negocio** para Quepia Creative Agency, en este repositorio (Next.js 15 + React 19 + TypeScript + Supabase).

### 1. Especificación

Leé **completo** `MCP_BUSINESS_CONTROL_PLAN.md` antes de escribir una línea de código. Es la especificación vinculante, en su versión 3. Si una comprobación actual contradice el documento, frená, presentá la evidencia y corregí primero la especificación.

El repositorio puede contener una implementación MCP parcial o completa de una
ejecución anterior. No asumas que parte de cero: inventariá primero los
artefactos existentes y, para cada fase ya materializada, tratala como una
auditoría de brechas contra el plan. Corregí o completá lo existente con
migraciones forward-only; no dupliques tablas, funciones, rutas ni servicios.

Mapa de lectura por si necesitás volver:

| Necesitás | Sección |
|---|---|
| Qué hay realmente en el código hoy (verificado) | §2.1 |
| Roles: compatibilidad y por qué no migrarlos en el MVP | §4.1 |
| Claims OAuth y matriz de interoperabilidad | §4.2 y §6 |
| Servidor remoto independiente, DCR y consentimiento con login admin existente | enmienda v3, §5.1 y §6.2–§6.4 |
| Por qué RLS sola no alcanza y qué hay que `REVOKE` | §5.3 y §6.1 |
| Requisitos de la spec de autorización MCP | §6.3 |
| Tablas nuevas, idempotencia, audit log append-only | §7.1 |
| Anulación y auditoría de todas sus dependencias | §2.1.f y §7.2 |
| Tipo de cambio y campos fiscales de reserva | §7.7, §7.8 |
| Catálogo de herramientas y convenciones de schemas | §8 |
| Contrato prepare/commit reforzado | §9.2 |
| Mecanismo de aprobación de nivel 3 | §10.5 |
| Límites que bloquean, no que avisan | §11 |
| Qué hacer con el bot de Telegram | §12 |
| Los 25 invariantes a testear | §13 |
| Pruebas, CI de seguridad y staging | §17 |
| Runbook de incidentes | §18 |
| Los 21 criterios de aceptación | §19 |
| Fases y su orden obligatorio | §20 |
| Decisiones que tenés que preguntarme | §22 |

### 2. Reglas de trabajo — no negociables

1. **Una fase por vez.** Seguí las fases de §20 en orden. Al terminar cada una, parás, mostrás qué hiciste, contra qué invariantes lo probaste, y **esperás mi confirmación** antes de seguir.
2. **Nunca ejecutes migraciones contra producción.** Generá el SQL; yo lo aplico. Si necesitás validar algo en vivo, pedime el proyecto de staging (§17).
3. **Migraciones deterministas y verificables.** Creá cada archivo con `supabase migration new`. Preferí cambios backward-compatible y transaccionales; usá expandir → backfill → validar → contraer. Fallá explícitamente si existe un objeto incompatible: no uses `IF NOT EXISTS` para ocultar drift. Definí `lock_timeout`/`statement_timeout` y agregá rollback o runbook según el riesgo real.
4. **`SUPABASE_SERVICE_ROLE_KEY` no entra al servicio MCP.** Ni como fallback, ni como variable opcional, ni "temporalmente para debug".
5. **No rompas la web.** Los `REVOKE` de §5.3 se aplican en la **fase 5**, recién después de migrar la ruta equivalente a comandos de dominio. Adelantarlos rompe la aplicación en producción.
6. **Leé antes de escribir.** Antes de tocar un archivo, leelo entero. Antes de crear una tabla, función o hook, verificá en `supabase/migrations/` y en `lib/` que no exista algo equivalente. Este repo ya tiene 80+ migraciones y varias funciones con nombres parecidos.
7. **Tests junto con el código, no después.** Cada fase entrega sus tests. Un invariante de §13 sin test no cuenta como implementado.
8. **No resuelvas en silencio las decisiones de §22.** Si una te bloquea, preguntámela.
9. **Reportá lo que no hiciste.** Si algo queda fuera, decilo explícitamente en el resumen de la fase en vez de dejarlo implícito.
10. **El objetivo es remoto, no local.** El entregable instalable usa Streamable HTTP en `https://mcp.quepia.com/mcp`. Una prueba local puede complementar CI, pero no satisface interoperabilidad ni reemplaza la prueba OAuth remota.
11. **DCR no equivale a autorización.** Un cliente dinámicamente registrado queda sin acceso de negocio hasta que Supabase devuelva su `client_id` en una solicitud válida y el login web directo existente de un `admin` activo apruebe el consentimiento. Conectar, listar o revocar no exige inscripción MFA. El MCP nunca puede provisionarse a sí mismo.
12. **Aislá los tokens OAuth de la sesión web.** Todo JWT con `client_id` usa el rol técnico `mcp_authenticated`; no hereda los privilegios de `authenticated`. Un `pgrst.db_pre_request` solo permite los RPCs MCP exactos y las rutas protegidas de Next.js rechazan sesiones de cliente. Tanto el login de consentimiento como el access token pueden ser AAL1; AAL2 se conserva para aprobar operaciones contables preparadas.
13. **Revocá ambos planos.** El grant interno sigue la vida del grant OAuth. Al revocar, iniciá en paralelo Auth y base de datos, conservá resultados parciales e impedí que un fallo o timeout de un plano evite intentar el otro.

### 3. Arranque — Fase 0

Empezá por la **Fase 0** de §20 y no avances sin mi confirmación. Concretamente:

1. **Reconciliá migraciones antes de diseñar tablas.** Compará historia local/remota y esquema real; detectá los dos `055_*` y objetos aplicados fuera del historial. No ejecutes `migration repair` ni cambios remotos sin autorización explícita.
2. **Probá OAuth en staging**, no solo un claim: discovery, DCR, PKCE, `resource` en authorization/token, `aud` y rol técnico mediante Custom Access Token Hook, `client_id`, `session_id`, login web directo AAL1 del `admin`, AAL1 en el access token intercambiado, refresh rotation, revocación y respuesta 2xx. El administrador configura solo la URL del MCP; no copia un `client_id` ni un secreto. Verificá por separado que aprobar una operación contable sigue exigiendo AAL2.
3. **Inventariá y traeme tres listas:**
   - todos los `.delete()` sobre tablas núcleo en `lib/sistema/hooks/**` y `components/**`;
   - todas las foreign keys `ON DELETE CASCADE` sobre entidades principales;
   - todos los usos de `service_role`, con qué escribe cada uno.
4. **Auditá las funciones existentes**: cuáles son `SECURITY DEFINER` sin `SET search_path`, cuáles tienen `EXECUTE` para `PUBLIC`, `anon` o `authenticated`, y qué rutas contables permiten.
5. **Confirmá el estado de backup/PITR** del proyecto Supabase desde el dashboard o una API que realmente lo exponga; no lo infieras.
6. **Traeme las decisiones de §22** en una lista, con tu recomendación para cada una y el impacto de elegir mal.

No escribas todavía tablas `mcp_*`, ni el servicio MCP, ni comandos de dominio. La Fase 0 es diagnóstico y decisiones.

### 4. Cómo quiero los entregables de cada fase

- Qué cambió, archivo por archivo.
- Qué invariantes de §13 quedan cubiertos y con qué test.
- Qué criterios de §19 se pueden verificar ya.
- Qué quedó pendiente y por qué.
- Qué necesito hacer yo (aplicar migraciones, configurar env vars, decidir algo).

## --- FIN DEL PROMPT ---
