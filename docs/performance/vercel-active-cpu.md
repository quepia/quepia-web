# Reducción de Active CPU — 13/10/2026

Cambios preparados localmente; no se desplegaron ni se cambiaron planes/equipos.

## Comportamiento

- Stories: polling a 15 segundos sólo con jobs pendientes y pestaña visible. La carga inicial, acciones manuales y el disparador de procesamiento de cola siguen disponibles.
- Inbox: 60 segundos; conexiones: 120 segundos; publicaciones: 180 segundos. Todos pausan el polling oculto y actualizan al volver a la pestaña. Inbox/conexiones no disparan polling mientras su consulta está en curso.
- Home, servicios y sobre-nosotros: ISR de una hora. Configuración pública y datos del portfolio: caché de una hora, invalidada tras guardar desde los cuatro módulos de administración (incluye altas, cambios, bajas y destacado).
- /trabajos mantiene sus parámetros de categoría y render dinámico; cachea la consulta pública con el mismo orden anterior. No se promete convertirla en una página estática.
- La acción de invalidación exige administrador global, sesión web directa y MFA. Si falla después de guardar, el usuario recibe un aviso; no se revierte el guardado ni se indica que la escritura falló.
- PDF: cada descarga sigue autorizándose y cargando el documento. Sólo sus bytes renderizados se reutilizan en memoria del proceso, por hash del documento. Límite de 16 MiB y 32 entradas; vence en una hora. No comparte datos entre instancias y no expone caché pública. Cold starts y otras instancias volverán a renderizar.
- Middleware: excluye sólo /api/internal/social/process y /api/internal/monthly-backups, cuyos handlers validan CRON_SECRET independientemente. Mantiene las demás rutas privadas, MFA y comprobaciones de sesión.
- vercel.json configura ignoreCommand para cambios exclusivamente en docs/ o README.md. Compara contra VERCEL_GIT_PREVIOUS_SHA; si faltan referencias o Git falla, construye. Mantiene todos los crons.

## Límites deliberados

- No se alteraron la cola de stories, su concurrencia, publicación, crons ni frecuencia del worker de GitHub.
- No se trasladó ffmpeg ni se creó almacenamiento de derivados de video. Hace falta elegir/provisionar un worker y probar permisos, reintentos y continuidad de publicaciones antes de esa migración.
- No se cambiaron tablas, RLS, cuentas, secretos ni planes.
- La configuración de ignoreCommand corresponde a este proyecto raíz. No se cambió la configuración externa de quepia-mcp; su filtro necesita auditar las dependencias compartidas.
- Ediciones de contenido realizadas fuera de estos módulos (SQL, scripts o integraciones) dependen de la revalidación temporal o deben invocar una invalidación autorizada equivalente.

## Verificación y medición

Pruebas: node --test tests/performance/cpu-regressions.test.mjs lib/security/*.test.mjs supabase/tests/security/*.test.mjs
Resultado: 27 pruebas aprobadas. Build final aprobado, incluida la comprobación de tipos; lint sin errores en archivos modificados (dos avisos previos de imports no usados). El build completo también muestra avisos del repositorio.

Build: pnpm build

Comparar ventanas equivalentes antes/después del deploy: CPU total por proyecto y ruta, invocaciones y errores. Mantener visibles período, entorno y deployment. No estimar ahorro total de CPU a partir de intervalos de polling.

Comprobar en producción tras desplegar:
1. Abrir cada panel, confirmar carga inicial y actualización manual; ocultar/mostrar pestaña.
2. Crear historias y confirmar que la cola termina sin generación duplicada.
3. Editar configuración/equipo/proyecto/servicio y verificar contenido público en la siguiente visita.
4. Descargar facturas/notas autorizadas y confirmar rechazo sin sesión o sin acceso al documento.
5. Revisar éxito de ambos crons y del workflow social.
6. Verificar un commit sólo de documentación omitido y un commit de código construido.

El entorno local usa Node 24; el proyecto declara Node 22. El build puede mostrar avisos preexistentes del repositorio y de Supabase en Edge. No equivale a una prueba de navegador autenticado ni a una medición de Vercel.
