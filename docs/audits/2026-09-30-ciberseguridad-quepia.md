# Revisión de ciberseguridad de Quepia — 30/09/2026

## Dictamen
Hay controles sólidos, pero no conviene considerar cerrado el riesgo para gestionar cuentas de clientes. Prioridad inmediata: actualizar procesamiento de imágenes, exigir MFA y cerrar accesos públicos heredados. Esta revisión no es una certificación ni una prueba de penetración completa.

## Alcance y evidencia
Revisión del código local, auditoría de dependencias de producción, consultas de solo lectura al proyecto Supabase quepia-pagina (luhbezpflvmevorbayai), asesores de seguridad y una solicitud GET sin sesión a quepia.com. No se modificaron datos, no se publicaron contenidos ni se enviaron notificaciones. No se verificó qué versión exacta de cada dependencia ejecuta el despliegue, la infraestructura interna de Zernio ni registros históricos de incidentes.

## Hallazgos prioritarios

1. **Urgente: dependencias de procesamiento de imágenes vulnerables en el lockfile.** La auditoría informa 2 alertas críticas, 10 altas y 4 moderadas (avisos, no necesariamente vías explotables distintas). Next 15.5.22 está afectado por GHSA-2xp9-vwfh-vxw4, ejecución remota asociada a optimización AVIF; corrección mínima 15.5.24. Sharp 0.34.5 requiere al menos 0.35.4 según GHSA-rgj7-g3m4-5g8c. El sistema procesa imágenes con Sharp y permite imágenes remotas; confirmar exposición real en producción. La segunda alerta crítica de Next es específica de servidores Windows y no se debe equiparar al riesgo del alojamiento Vercel observado. Corregir dependencias transitivas afectadas (PostCSS, nanoid, brace-expansion, fflate) y verificar compatibilidad/build.

2. **Alta: MFA ausente para administradores y no exigido en Zernio.** La base tiene 3 administradores activos y 0 con factores verificados. lib/zernio/server.ts y lib/social/auth.ts no exigen aal2. El módulo MFA existente se utiliza para otras operaciones MCP. Una contraseña o sesión robada de un administrador permitiría operar las cuentas accesibles a esa sesión. Exigir MFA al conectar cuentas, publicar, cancelar y responder mensajes, y configurar factores en los administradores.

3. **Alta: RPC pública confía en identidad suministrada.** En producción, public.bulk_insert_calendar_events es SECURITY DEFINER y ejecutable por anon. Comprueba pertenencia usando p_user_id recibido, sin compararlo con auth.uid(). El filtro previo mcp_postgrest_pre_request retorna para peticiones sin client_id OAuth. Quien conozca identificadores válidos de usuario y proyecto podría insertar eventos haciéndose pasar por ese usuario. Esto afecta integridad del calendario; no demuestra por sí solo acceso a credenciales ni publicación en redes. Confirmado por definición y privilegios, sin insertar eventos reales. Revocar EXECUTE a anon/PUBLIC, usar identidad autenticada y verificar autorización activa y pertenencia.

4. **Media: endpoint de diagnóstico público con efectos laterales.** GET https://quepia.com/api/test-email?action=check_env respondió 200 sin sesión. app/api/test-email/route.ts no comprueba usuario; test_notification acepta userId y llama a notifyUser, que usa service_role y puede enviar correo. No se invocó esa acción. Retirar diagnóstico de producción o protegerlo con administrador y POST/origen válido; eliminar prefijos de secretos de las respuestas.

5. **Media: defensa contra scripts débil.** CSP en producción permite unsafe-inline y unsafe-eval. Eso reduce la protección si aparece una inyección. Migrar scripts a nonces/hashes y eliminar eval, verificando compatibilidad.

6. **Endurecimiento pendiente en Supabase.** Protección contra contraseñas filtradas desactivada. 37 funciones con search_path mutable; 21 funciones SECURITY DEFINER ejecutables por anon y 58 por authenticated. No todos estos avisos representan vulnerabilidades: algunos RPC son públicos por diseño y requieren token. Revisar cada cuerpo y sus permisos; no revocar indiscriminadamente ni sumar estos avisos como ataques confirmados. Activar protección de contraseñas y fijar search_path con referencias calificadas.

## Controles positivos verificados
- RLS habilitado en todas las tablas del esquema public consultadas. Los datos de perfiles/cuentas Zernio tienen política de denegación al cliente; el módulo social utiliza rutas de servidor.
- sistema-assets es privado; project-images es público, por lo que debe reservarse para material público.
- La clave ZERNIO_API_KEY se consulta en código de servidor, sin exposición NEXT_PUBLIC detectada en los caminos revisados.
- El módulo social exige administrador global activo y autorizado, rechaza sesiones OAuth/MCP y comprueba origen en mutaciones.
- Publicación valida cuentas contra la integración del proyecto y assets contra la tarea.
- Webhooks verifican HMAC con comparación constante y deduplicación. Procesador interno exige secreto de servicio.
- Triggers en producción impiden que usuarios comunes modifiquen su rol o se autoricen a sí mismos.
- HTTPS/HSTS presentes en producción. Las credenciales .env revisadas no están versionadas actualmente ni aparecieron en el historial consultado para esos nombres; esto no equivale a un escaneo exhaustivo de secretos.
- 28 pruebas pertinentes de autorización, límites de sesión, módulo social y reglas de publicación pasaron.

## Orden recomendado
1. Actualizar Next/Sharp y dependencias transitivas, verificar y desplegar.
2. Configurar y exigir MFA para operaciones sociales sensibles.
3. Corregir RPC de calendario y retirar endpoint de pruebas.
4. Revisar privilegios de funciones, CSP y contraseñas filtradas.
5. Verificar el despliegue y completar pruebas con usuarios de distintos roles, sesiones revocadas y datos de prueba; revisar auditoría y permisos otorgados dentro de Zernio.

## Fuentes
- https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4
- https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Correcciones aplicadas tras la revisión

- Next actualizado a 15.5.26 y Sharp a 0.35.5; versiones transitivas corregidas en ambos lockfiles. Auditorías de producción de la web con pnpm y npm: 0 vulnerabilidades. MCP: 0 vulnerabilidades de producción tras actualizar fast-uri, Hono, ip-address y qs. Quedan avisos del entorno de desarrollo, que no se despliega como dependencia de producción.
- MFA obligatorio para administradores al acceder al sistema y a sus APIs sociales; los helpers de Zernio y del módulo social también verifican aal2 y sesión web directa. Configuración y verificación personal del factor se realizan en /auth/mfa. No se crean factores en nombre de los usuarios.
- Eliminado /api/test-email. En la compilación verificada responde 404.
- Agregada verificación de origen para las mutaciones de /api/zernio; prueba HTTP cross-site responde 403.
- CSP con nonce aleatorio por solicitud en /sistema, /admin, /auth y /oauth; sin unsafe-inline ni unsafe-eval en scripts de producción de estas páginas. Se eliminó unsafe-eval en la política global; la web comercial conserva inline para su renderizado estático y analítica. Verificado que todos los scripts activos del HTML de login tienen el nonce de esa respuesta.
- Migración cybersecurity_hardening aplicada al proyecto productivo: RPC calendario vinculada a auth.uid(), rechazo de identidad suministrada diferente, autorización activa, pertenencia al proyecto, bloqueo OAuth y límites de importación. EXECUTE revocado a anon y mcp_authenticated. Petición REST sin sesión verificada: 401/42501, sin escribir datos.
- Corregidos los 37 search_path mutables. Revocado CREATE en public a roles cliente y EXECUTE público de triggers/helpers internos. Avisos de funciones privilegiadas anónimas reducidos de 21 a 7. Los RPC de enlaces de clientes y el hook de PostgREST conservan permisos intencionales. La extensión vector sigue en public; moverla requiere analizar consumidores y no se hizo en esta corrección.
- Protección de contraseñas filtradas: intento de activación rechazado con HTTP 402 porque requiere plan Pro o superior. Permanece desactivada; no se modificó la facturación.
- Verificación: 88 pruebas de seguridad/web/SQL, 91 pruebas MCP, revisión de tipos, lint de los archivos cambiados, límites MCP y sintaxis SQL correctos. Build de producción correcto (con advertencias de lint preexistentes fuera del cambio). Conversión y redimensionado de imagen con Sharp 0.35.5 verificados.

Navegador local: login y página pública cargan sin errores; /sistema y /auth/mfa redirigen a login cuando no hay sesión. Las comprobaciones locales no sustituyen verificar el despliegue de main ni realizar pruebas autenticadas con MFA real: el alta del factor depende de cada administrador.
