# Sincronización social — 1 de octubre de 2026

El delta enviaba limit=200 y Zernio rechaza valores mayores a 100. El 400 se interpretaba como cursor vencido y disparaba otra carga histórica. Se usa 100 y solo se invalida el cursor cuando el error menciona cursor.

El worker reclama un trabajo por vez para no abandonar leases al detenerse por cuota. La nueva RPC social_defer_job libera el lease, reprograma y revierte el intento consumido por una pausa de cuota; solo service_role puede ejecutarla.

Conexiones ofrece Sincronizar todo, actualización del estado cada 10 segundos y diagnóstico plegado. La carga histórica manual queda en opciones avanzadas. El procesamiento manual de delta permite ejecutar el bootstrap que solicita cuando falta cursor.

Validación: tipos, ESLint de archivos modificados, pruebas unitarias, worker, analítica e inteligencia con PGlite. No se ha verificado visualmente en navegador ni contra cuentas reales.

## Publicación

Aplicar primero 20261001132257_social_sync_deferral.sql y después desplegar la aplicación. El script scripts/social/apply-social-migrations.mjs incluye esta migración. No ejecutar db push sobre el historial divergente del proyecto. Tras desplegar, usar Sincronizar todo y comprobar analytics_delta, estadísticas disponibles y análisis de horarios. Las demoras y ausencia de métricas del proveedor todavía pueden limitar la muestra.

## Recuperación de Brandalise

El listado global /analytics omite Brandalise, aunque las consultas por accountId y profileId devuelven 64 publicaciones en 180 días. El bootstrap ahora pagina por cada cuenta asignada y activa. Sincronizar todo incluye carga histórica incluso si existe un cursor global válido. Una prueba simula listado global vacío y exige accountId. Se recuperaron 64 publicaciones con 1058 métricas; 34 publicaciones corresponden a los últimos 90 días. La pantalla separa permiso disponible de estadísticas importadas y no interpreta ausencia de fecha del proveedor como ausencia de datos. La cobertura respeta los filtros elegidos.
