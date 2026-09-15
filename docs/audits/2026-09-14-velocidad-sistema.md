# Auditoría de velocidad del sistema Quepia — revisión y correcciones

## Publicado y medido después del push

Estado al 15/09/2026 02:11 UTC: mejoras subidas a main en `79759bd7071ed6d89af8ccfbb833440bd550526d`. Vercel confirmó READY para `dpl_HuXSE7vJZWTbnwSjcDs8p4qWyoVt`, asociado a quepia.com. Build local de producción aprobado y 35 pruebas aprobadas. Esta sección reemplaza como estado actual las notas históricas de «cambios locales» que siguen abajo.

Medición posterior sobre la sesión real, con recarga para obtener la versión publicada. Mismo criterio de disponibilidad de controles del tablero y sobrecarga de automatización; tres muestras, sin throttling ni limpieza de caché. Las rondas anterior y posterior ocurrieron en momentos diferentes, por lo que red, caché y estado del servicio pueden influir.

| Operación | Muestras posteriores (ms) | Mediana anterior | Mediana posterior | Cambio observado |
|---|---|---:|---:|---:|
| Recarga completa | 5.396 / 4.419 / 4.383 | 5.374 ms | 4.419 ms | −17,8% |
| Camping | 2.221 / 1.129 / 657 | 1.013 ms | 1.129 ms | +11,5% |
| Brandalise | 2.107 / 662 / 1.021 | 2.174 ms | 1.021 ms | −53,0% |

La muestra demuestra mejores medianas observadas en recarga y Brandalise, **no una mejora uniforme ni causalmente aislada en todos los proyectos**. Camping no mejoró en esta comparación. La primera visita posterior a cada proyecto fue más lenta que los regresos, pero sigue sin haberse agregado caché persistente por proyecto; no atribuir el resultado a una caché nueva.

Antes de las tres recargas válidas, se observó una pantalla de error de acceso transitorio, y luego la sesión volvió a mostrar el tablero. Esa observación se conserva como fallo separado, no como carga rápida ni como muestra exitosa. Las tres recargas tabuladas no mostraron ese error. No se determinó la causa exacta de ese primer fallo.

Consulta de logs del deployment, filtro error/fatal, 15/09 02:01–02:11 UTC: sin resultados. Esto no descarta errores de cliente o requests cancelados; los logs de información incluyeron peticiones con estado 0 durante la recuperación. No hay una traza de red autenticada completa para atribuirlos.

Conclusión de publicación: cambios de rendimiento implementados y disponibles; reducción de firma y de consultas comprobada; mejora observada en dos de tres escenarios. Pendientes: estabilidad de acceso intermitente, caché por proyecto con invalidación segura, carga de completadas bajo demanda y una muestra mayor con instrumentación por etapa.

---


## Segunda ronda y preparación de publicación

Actualización: 15/09/2026 02:05 UTC (14/09, 23:05 Argentina). Los cambios se validan contra la base `2aad7e5`; en la nueva medición previa, Vercel todavía publicaba `dpl_6vTEFLmbWtx4PWoX79GcguQAF38S`. El usuario autorizó el push a main después de verificar las mejoras.

### Nueva línea base en la sesión publicada, antes del push

Mismo método aproximado de accesibilidad de Safari Web App: incluye sobrecarga de automatización y detecta disponibilidad de columnas, no la carga completa de imágenes. Tres muestras por caso, sin throttling ni vaciado de caché. Estos resultados NO son el después de las correcciones locales.

| Operación | Muestras en ms | Mediana |
|---|---|---:|
| Recarga completa hasta tablero | 7.958 / 5.310 / 5.374 | 5.374 ms |
| Cambiar a Camping | 930 / 2.187 / 1.013 | 1.013 ms |
| Cambiar a Brandalise | 2.309 / 1.743 / 2.174 | 2.174 ms |

Se descartó como tiempo completo una observación de 6.453 ms que solo acreditaba la barra lateral: el contenido aún estaba esperando. La variación frente a la primera auditoría no puede atribuirse al código local sin desplegar.

### Correcciones adicionales ya implementadas

- Se eliminó la petición check-tables del arranque. La respuesta de perfil comunica explícitamente la ausencia de tablas; un timeout, 502 o JSON inválido muestra un error recuperable, nunca instrucciones falsas de instalación.
- El GET de perfil propio reutiliza el perfil que acaba de validar: dos consultas de usuarios dentro de la ruta pasan a una. En proyectos propios también reutiliza el rol; admin consultando otro usuario conserva los permisos del destinatario.
- Se deduplican únicamente lecturas concurrentes del perfil. Reintentar tras un error realiza una consulta nueva.
- Se descartan respuestas de perfil tardías tras cerrar sesión, cambiar de usuario o desmontar. La sesión inicial no puede sobrescribir un evento de autenticación más reciente.
- La espera de getSession tiene salida de recuperación a los 8 s; la petición de perfil lleva cancelación a los 10 s. No representan una garantía del tiempo de middleware o servidor.
- Hay pantalla de error de acceso con reintento y opción de volver a iniciar sesión. Se conservan validaciones de sesión, perfil autorizado, roles y controles de middleware.

Validación de esta ronda: 35 pruebas aprobadas, typecheck aprobado, revisión del diff sin errores de formato. La reducción de consultas se verifica contando llamadas en pruebas de la ruta real con clientes simulados; la mejora de firma real documentada abajo sigue siendo 791,5 → 281,5 ms. No se anuncia un porcentaje de mejora global antes de medir el despliegue.

Las observaciones de estado local y pendientes en las secciones anteriores se conservan como historial de cada ronda. La comprobación de tablas y duplicación de perfil de la API ya fueron corregidas en esta segunda ronda; siguen pendientes la caché de proyectos y la carga bajo demanda de completadas.

---


Fecha: 14 de septiembre de 2026. Base del código local: `2aad7e5`. Primera auditoría: aproximadamente 13:29–13:44 UTC. Revisión y validación de correcciones: aproximadamente 19:00–19:20 UTC. Producción observada en la primera auditoría: `quepia.com`, deployment `dpl_6vTEFLmbWtx4PWoX79GcguQAF38S`.

**Estado de la primera revisión (histórico):** correcciones implementadas y probadas en el repositorio local. No se desplegó, no se cambiaron permisos ni se modificaron datos de negocio. Los tiempos de navegación de la primera auditoría son la línea base, no resultados del código corregido. No se ha demostrado todavía una mejora porcentual del tiempo total autenticado en producción.

## Correcciones implementadas

| Problema | Corrección local | Verificación |
|---|---|---|
| El tablero esperaba los enlaces de miniaturas | Publica tareas y columnas antes de completar la firma; las imágenes llegan después | Prueba del hook real con firma pendiente y con fallo de red |
| Una solicitud por archivo | Una solicitud batch, deduplicada; conserva orden y resultados parciales | Pruebas de errores parciales, error global, duplicados y entradas vacías; medición real contra Storage |
| Paths privados usados como imágenes antes de firmarse o ante fallos | Se muestran placeholders; solo se usan URLs HTTP(S) válidas | Pruebas de imágenes públicas/privadas, errores y referencias inválidas |
| Una respuesta tardía podía pisar cambios | Miniaturas actualizadas sobre el estado actual, conservando ediciones y descartando respuestas obsoletas al desmontar | Pruebas de tareas borradas, títulos editados y previews reemplazadas |
| Esperas de consultas del tablero sin cancelación | Señal de cancelación de 15 s compartida por las lecturas; firma con señal de 8 s; mensaje de error y botón para reintentar | Compilación y revisión del flujo; pendiente ensayo autenticado con red degradada. No es un límite global del arranque ni de una eventual espera interna de Auth |
| Un refresh inmediato reutilizaba un resultado terminado | El mapa ahora deduplica solo solicitudes en curso y elimina tanto éxitos como fallos al terminar | Prueba de dos refresh seguidos que realizan dos lecturas reales del mock |
| Aviso MCP bloqueaba el arranque | Consulta opcional por GET en segundo plano; mantiene verificación de sesión y lifecycle | Pruebas de sesión ausente, rechazo de lifecycle y cabecera private/no-store |
| Configuración pública consultada en cada render sin límite | Selecciona solo clave/valor, deduplica por render, caché compartida de 60 s y cancelación de consulta a los 2 s | Compilación y revisión de cliente anónimo; no se cachea información de sesión |
| Auth esperaba el perfil dentro del callback de sesión | Callback sin async; la consulta del perfil continúa sin ser esperada por el SDK | Prueba del callback con endpoint de perfil permanentemente pendiente |

Archivos principales: `lib/sistema/hooks/useTasks.ts`, `lib/sistema/task-thumbnails.ts`, `lib/sistema/assets-storage.ts`, `lib/sistema/hooks/useAuth.ts`, `lib/fetchConfigServer.ts`, `app/sistema/page.tsx`, `app/sistema/dashboard-boot.tsx`, `app/api/mcp/setup-prompt/route.ts` y `components/sistema/quepia/kanban-board.tsx`.

La caché de configuración pública puede retrasar hasta aproximadamente 60 s la actualización habitual de esa configuración; durante una revalidación fallida Next puede seguir sirviendo el último valor disponible. No se agregó caché persistente de tareas ni de enlaces privados en esta intervención.

## Nueva medición de la implementación batch

Cuatro repeticiones alternando el orden individual/batch. La prueba ejecutó el helper corregido, con TypeScript compilado a ES2022 y el cliente real de Supabase. Se seleccionaron seis referencias privadas de assets de Camping, incluyendo completadas. **No se afirma que sean los mismos seis archivos de la primera auditoría.** Se mantuvieron idénticas dentro de cada comparación. Red local → Supabase us-west-2, credencial servidor, sin paso por Vercel ni autenticación del usuario.

| Repetición | Individual concurrente | Batch corregido | Resultados válidos por modalidad |
|---|---:|---:|---:|
| 1 | 969 ms | 304 ms | 6 / 6 |
| 2 | 317 ms | 273 ms | 6 / 6 |
| 3 | 763 ms | 270 ms | 6 / 6 |
| 4 | 820 ms | 290 ms | 6 / 6 |
| Mediana | **791,5 ms** | **281,5 ms** | Todos |

Diferencia: **510 ms, 64,4%** en la operación aislada. Muestra pequeña; no extrapolar a toda la aplicación. El beneficio adicional de dejar de esperar miniaturas está verificado como comportamiento, todavía sin medición end-to-end autenticada.

Se descartaron dos intentos inválidos del instrumento: uno no seleccionó archivos y otro compiló el helper de prueba con un target inadecuado para iterar Set. Sus ceros no son resultados de rendimiento. La tabla anterior exige seis URLs válidas por operación.

## Nuevas causas y precisiones del diagnóstico

- **Retención del bloqueo de Auth:** el SDK instalado espera los callbacks de onAuthStateChange. El callback anterior esperaba HTTP del perfil; eso podía prolongar el bloqueo de sesión y retrasar otros requests del cliente. Se corrigió. No se demostró un deadlock circular ni se atribuye a esto por sí solo el episodio de 65 s.
- **Miniaturas rotas generaban solicitudes relativas:** antes, ante ausencia/error de firma, se dejaba el path privado como thumbnail_url. Podía tratarse como URL relativa al sitio y producir solicitudes inútiles. Se corrigió con placeholders.
- **Autorización repetida, pendiente:** el middleware efectivo es `lib/supabase/middleware.ts`, importado desde `middleware.ts`. Hace claims → usuario → perfil; `/api/sistema-data` vuelve a consultar usuario y perfil, y `type=user` vuelve a leer el perfil completo. No se retiraron estas verificaciones: una deduplicación futura debe preservar identidad, revocación y roles.
- **check-tables, pendiente:** `useAuth` espera esa comprobación en su inicialización y la consulta atraviesa middleware. Un error HTTP puede confundirse en el cliente con tablas inexistentes. Merece una corrección separada de recuperación de sesión y errores.
- **Contenido mutable:** en esta revisión Camping tenía 23 tareas, 5 activas y 28 assets, frente a los 19/26 de la primera lectura. No se alteraron desde esta auditoría. Por eso los conteos y la selección de archivos deben fecharse y no mezclarse al comparar.
- **El timeout de 65 s sigue sin causa única acreditada:** configuración y aviso MCP ya no bloquean del mismo modo, pero middleware/Auth y fallos externos aún pueden retrasar una recarga. No se declara resuelto el incidente solo porque compile la corrección.

## Validación de la revisión

- 21 pruebas aprobadas: batch, carga progresiva, errores de firma, previews tardías, refresh inmediato, callback Auth, aviso MCP y límites de acceso existentes.
- `npm run typecheck`: aprobado.
- `npm run build`: aprobado; existen advertencias previas de lint en el proyecto (sin errores). La compilación se volvió a ejecutar tras las correcciones finales.
- Lint focalizado: sin errores; advertencias existentes en Kanban/useTasks por variables y uso de img.
- Verificación local con build de producción: `/sistema` sin sesión redirige a login (307); el navegador muestra el formulario de acceso. El endpoint del aviso devuelve cabecera `private, no-store`; las pruebas verifican que sin sesión el aviso permanece falso.
- No se transfirió la sesión de Safari al entorno local ni se cambió la autenticación para probar. Por eso la verificación visual local no cubre el tablero autenticado.

Comando reproducible de pruebas:

```sh
node --test lib/sistema/assets-storage.test.mjs lib/sistema/task-thumbnails.test.mjs lib/sistema/hooks/useTasks.test.mjs lib/sistema/hooks/useAuth.test.mjs app/api/mcp/setup-prompt/route.test.mjs lib/sistema/auth/authorization.test.mjs lib/mcp/session-boundary.test.mjs
```

Referencias verificadas: [firma batch Supabase](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls), [callback de Auth](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [caché de Next.js](https://nextjs.org/docs/app/api-reference/functions/unstable_cache). La explicación del bloqueo también se contrastó con `node_modules/@supabase/auth-js/src/GoTrueClient.ts`, que espera sus suscriptores.

## Pendientes priorizados

1. Desplegar la corrección por el flujo habitual y medir tablero autenticado: mismas condiciones, primera visita/regreso separados, waterfall por etapa y correlación de errores. No hay nuevos tiempos de producción todavía.
2. Resolver la comprobación check-tables y duplicación de consultas de perfil preservando autorización.
3. Implementar caché de proyectos por sesión con invalidación segura y medir las lecturas de completadas bajo demanda.
4. Instrumentar los tiempos de backend y el arranque completo para localizar los bloqueos residuales; revisar peso/fonts después.

---

# Línea base: auditoría anterior a las correcciones

Las secciones siguientes conservan las observaciones originales. Sus referencias de línea corresponden al código base `2aad7e5`, no necesariamente al archivo editado actual. En esta primera fase no se modificó el producto.

## Resultado

Hay dos problemas diferentes: apertura de proyectos con una espera reproducible de varios segundos y episodios de carga inicial bloqueada. El código hace depender la visualización de tareas de la firma de enlaces de miniaturas; además encadena consultas de sesión y configuración. Los registros de producción contienen fallos de servicios de datos. No hay evidencia suficiente para atribuir toda la demora a SQL lento, al peso del frontend o a una sola causa.

## Mediciones de la sesión real

Safari Web App «Sistema | Quepia», sesión ya iniciada, equipo y conexión actuales, sin simulación de red ni CPU. Navegación entre proyectos existentes sin editar tareas. Cronómetro desde antes de la acción de clic hasta detectar los controles «Mover columna» en accesibilidad. Incluye sobrecarga de automatización y observación: son tiempos aproximados de disponibilidad del tablero, no Web Vitals ni tiempos exactos del navegador. No mide la descarga completa de imágenes. No representa caché fría.

| Destino | Última observación sin tablero | Tablero observado |
|---|---:|---:|
| Camping, muestra 1 | 2.925 ms | 3.202 ms |
| Brandalise, muestra 1 | 3.365 ms | 3.576 ms |
| Camping, muestra 2 | 3.368 ms | 3.457 ms |
| Brandalise, muestra 2 | No registrada antes de aparecer | 1.402 ms |
| Camping, muestra 3 | 3.313 ms | 3.408 ms |

Camping: mediana observada **3,408 s**, rango 3,202–3,457 s (n=3). Brandalise: 1,402–3,576 s (n=2), insuficiente para percentiles. Un primer cambio a Brandalise se descartó porque hubo una pausa entre observaciones.

Una recarga completa mostró el esqueleto de carga y continuaba sin tablero al comprobarla unos **65 segundos** después. La captura automática falló durante el primer intento: se confirmó visualmente el estado posterior, pero no se dispone de una traza continua ni de un tiempo de finalización. Se reintentó la recarga y persistió la pantalla de espera en la siguiente comprobación. Se trata de un episodio observado, no de una mediana ni de una prueba de que todas las recargas fallen.

## Prueba controlada de firma de archivos

Los mismos seis paths de Storage correspondientes a assets activos de Camping; credencial servidor ya existente, máquina local → Supabase us-west-2. No se guardaron ni expusieron URLs firmadas. Tres repeticiones, siempre individual antes de batch; posible sesgo de calentamiento. No incluye middleware, autenticación de usuario ni el trayecto por Vercel.

| Repetición | Seis solicitudes individuales concurrentes | Una solicitud batch |
|---|---:|---:|
| 1 | 881 ms | 282 ms |
| 2 | 706 ms | 343 ms |
| 3 | 751 ms | 294 ms |
| Mediana | **751 ms** | **294 ms** |

Todas HTTP 200, seis resultados y cero errores por archivo. Diferencia de medianas: **457 ms / 60,9%** en esta operación aislada. No equivale a un 60,9% de mejora de todo el sistema ni demuestra cuánto tarda actualmente la firma desde Vercel.

## Base de datos

Supabase verificado en us-west-2. Estadísticas históricas de `pg_stat_statements`, acumuladas desde 19/01/2026; no corresponden exclusivamente al usuario o navegación de esta auditoría. Tiempo SQL excluye red, auth, gateway y render.

| Familia de consulta | Llamadas | Media SQL | Máximo SQL |
|---|---:|---:|---:|
| Tablero: tareas y assets | 2.025 | 30,82 ms | 327,22 ms |
| Todas las tareas | 546 | 6,98 ms | 73,07 ms |
| Proyectos y conteos | 1.005 | 3,45 ms | 35,25 ms |
| Assets y versiones | 834 | 22,96 ms | 254,94 ms |

Volumen consultado: 267 tareas, 371 assets y 371 versiones. Brandalise: 135 tareas, 107 completadas (79,3%), 237 assets. Camping: 19 tareas, 14 completadas, 26 assets. El sidebar de la sesión mostraba 18 para Camping: los conteos de UI y consulta no coincidían; no se determinó si se debe a frescura, permisos o criterios distintos.

Existen índices de proyecto en tareas, tarea en assets/subtareas y asset en versiones. Un EXPLAIN reducido de Camping tareas + IDs de assets utilizó índices: ejecución 0,412 ms, planificación 3,830 ms y 61 buffers en caché. Es una consulta representativa reducida con contexto administrativo, no la consulta PostgREST exacta bajo RLS del usuario. No justifica recomendar índices nuevos como primera medida.

## Errores reales de producción

Registros consultados en Vercel para `quepia-web`; muestra de logs 14/09/2026 13:29–13:44 UTC (10:29–10:44 Argentina). Los grupos agregados devolvieron algunos first/last seen anteriores a la ventana solicitada: no se interpretan como un conteo exacto de esa ventana.

- Configuración del servidor: `Gateway Timeout`, incluyendo `/sistema`, y `Bad Gateway` en `/sistema` a las 13:28:55 y 13:31:36 UTC.
- `/api/sistema-data`: `Bad Gateway` y `Gateway Timeout` entre 13:31 y 13:33 UTC.
- Proyectos y otros datos: `Failed to get project config` a las 13:37:36 UTC.
- También hubo respuestas 200 a `/api/assets/sign` y `/sistema`; un 200 no acredita que la interfaz terminara de cargar.

Estos errores acreditan inestabilidad en las dependencias de datos. Sin IDs correlacionados de las peticiones de la sesión no se puede asignar el bloqueo de 65 s a un error concreto. La página pública de estado de Supabase mostraba API Gateway degradado y un incidente de rechazos JWT 401: eso **no prueba** que explique los errores 502/504 observados en Quepia. Fuente consultada: https://status.supabase.com/.

## Causas y evidencias en el código

1. **El tablero espera las miniaturas (prioridad alta, confirmado).** `lib/sistema/hooks/useTasks.ts:300` consulta columnas y tareas en paralelo; `:339` espera después subtareas; `:416` espera `/api/assets/sign`; recién al finalizar publica columnas y termina loading. `components/sistema/quepia/kanban-board.tsx:439` sustituye el tablero entero por un spinner. El texto y las tareas podrían aparecer antes de las miniaturas.
2. **Una llamada de firma por archivo (alta, confirmada y comparada).** `lib/sistema/assets-storage.ts:18` usa `Promise.all` sobre firmas individuales. `app/api/assets/sign/route.ts:11` vuelve a verificar usuario antes de firmar. Camping tiene seis paths de assets activos, Brandalise ocho; no incluye posibles thumbnails de YouTube. No se suman las duraciones individuales, porque corren en paralelo: se espera a la más lenta.
3. **Sin caché útil al regresar a un proyecto (alta, confirmado).** `dashboard-client.tsx:857` remonta Kanban con `key={activeProjectId}`. `useTasks` comparte cargas en vuelo, pero descarta el resultado aproximadamente un segundo después: no conserva una vista disponible para regresar más tarde.
4. **Carga inicial depende de funciones secundarias (alta para investigar).** `app/sistema/page.tsx:16` espera sesión y lifecycle de MCP antes de entregar DashboardClient. `app/layout.tsx:77` espera configuración pública, obtenida por `lib/fetchConfigServer.ts:13`. Los logs muestran fallos precisamente al cargar esa configuración. No se midió por separado cada etapa.
5. **Consultas encadenadas y repetidas (media).** `app/api/sistema-data/route.ts:102` autentica y busca perfil; `getUserProjectIds` vuelve a consultar rol. Proyectos para admin puede encadenar auth → autorización → rol → IDs → proyectos/conteos. `lib/supabase/middleware.ts:64` también verifica sesión y acceso. Optimizar conservando los controles de autorización.
6. **Se descargan datos ocultos (media).** La consulta de tareas incluye completadas y sus assets/versiones; solo evita firmar las miniaturas completadas por defecto. En Brandalise 107 de 135 tareas están completadas. Carga bajo demanda o selección de campos podría reducir transferencia, pero requiere conservar conteos, filtros y vistas.

No se encontró evidencia de tormenta de Realtime o polling en los hooks revisados. Ya hay imports dinámicos para las vistas principales: no corresponde recomendar lazy loading general como si no existiera.

## Peso del frontend y control HTTP

Build local del 31/08/2026, no reconstruido ni verificado byte a byte contra producción. Sumas de archivos deduplicados por manifest, gzip calculado localmente; no transferencia real actual.

| Conjunto | JS sin comprimir | Gzip calculado |
|---|---:|---:|
| Inicial: layout + sistema, 17 archivos | 949.034 B | 273.738 B |
| Kanban adicional | 95.304 B | 27.592 B |
| Modal de tarea adicional | 218.975 B | 56.664 B |

CSS inicial: 169.741 B sin comprimir, 27.605 B gzip. Kanban importa estáticamente recursos, modal de revisión y control Zernio; oportunidad secundaria de separación. Fuentes externas globales también merecen revisión. No se demostró que el peso explique el spinner.

Cinco peticiones HTTP sin sesión a `/sistema`, siguiendo redirección a login: 371, 302, 366, 334 y 293 ms totales; mediana 334 ms, HTML 16.915 B. **Esto mide login con redirección, no carga autenticada ni JavaScript del sistema.**

## Plan original de correcciones y validación (ver estado actualizado arriba)

1. Instrumentar etapas de carga autenticada y tiempos del servidor: sesión, configuración, proyectos, tareas, subtareas y firma. Registrar duración/estado sin datos personales ni URLs firmadas. Añadir recuperación visible y límites de espera para dependencias secundarias; identificar el bloqueo inicial antes de darlo por resuelto.
2. Mostrar tareas y columnas sin esperar imágenes; cargar miniaturas después, con manejo de errores y respuestas obsoletas al cambiar de proyecto.
3. Usar firma batch y caché limitada por vencimiento de enlaces; mantener autorización y acceso a archivos privados.
4. Conservar datos de proyectos visitados por sesión y actualizar en segundo plano. Invalidar al editar, cambiar de usuario, cerrar sesión o perder acceso.
5. Desacoplar configuración pública y aviso MCP del contenido principal; reducir consultas duplicadas sin retirar comprobaciones de acceso.
6. Evaluar completadas bajo demanda y componentes secundarios después de medir la mejora anterior.

Validación propuesta: al menos diez cambios por proyecto (Camping y Brandalise), diez recargas completas, primera visita y regreso separados, misma red/equipo, tiempos instrumentados y errores. Objetivos de trabajo, aún no resultados: regreso a proyecto en menos de 500 ms con caché; apertura normal por debajo de 1,5 s; cero esperas sin recuperación. No calcular p95 fiable a partir de la muestra pequeña actual.

Pendientes de auditoría instrumental: waterfall autenticado de red, duración de endpoints en Vercel, Web Vitals, peso de producción actual y correlación de fallos con cada navegación. No se ejecutó Lighthouse contra login para presentarlo como rendimiento del tablero. No hay un porcentaje global de mejora demostrado todavía.
