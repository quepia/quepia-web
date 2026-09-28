# Backups mensuales

En **Negocio → Backups mensuales**, debajo de Gestión social, un administrador puede entrar por cliente y año, ver cada mes, abrir sus carpetas en Drive y revisar los originales que no se pudieron recuperar. También existe el acceso directo `/sistema/backups`.

## Alcance y fechas

- Se recorre todo `sistema_asset_versions`, sin filtrar por notificación, aprobación ni revocación del acceso del cliente. Se incluyen todas las versiones y las carpetas enlazadas.
- El mes corresponde a la **fecha de subida registrada**, con horario de Argentina. No se inventan meses anteriores al primer registro.
- Estructura: `Clientes / Cliente / Backups mensuales (id del proyecto) / Año / AAAA-MM`. El identificador evita mezclar proyectos homónimos.
- Se crean copias independientes, sin hacer públicas las carpetas. Se heredan los permisos existentes de Drive.
- El historial conserva los nombres, la fecha, la fuente y los identificadores de las copias, aunque se borre la tarea o el proyecto. No hay claves foráneas que eliminen en cascada este archivo.
- Las carpetas enlazadas se recorren con paginación y se copian sus archivos y subcarpetas. Se guarda un punto de recuperación por archivo para continuar carpetas grandes. Los accesos directos se señalan como pendientes de revisión, nunca como copias completas.
- Un enlace a una carpeta mutable permite recuperar su contenido **actual accesible**, no reconstruir contenidos eliminados en meses anteriores. Para cambios posteriores a un respaldo completado, subir una nueva versión en el sistema; no se vigilan modificaciones externas de una carpeta ya copiada.
- No incluye documentos nunca cargados al sistema ni una exportación de comentarios, finanzas o textos de tareas. Un original inaccesible se muestra como error, no como respaldado.

## Ejecución

`/api/internal/monthly-backups` se programa diariamente a las 08:00 UTC (05:00 Argentina). Recorre el historial, copia pendientes y reintenta errores con espera creciente hasta un día. La primera ejecución de cada mes incluye cualquier pendiente del mes anterior. Los trabajos por lotes respetan un presupuesto de tiempo y continúan en la siguiente ejecución; el mes solo figura respaldado cuando todas sus versiones están copiadas. El botón **Respaldar pendientes** procesa lotes consecutivos y habilita un reintento inmediato de errores.

La programación requiere que el commit esté desplegado en producción. Variables: `GOOGLE_DRIVE_BACKUP_ENABLED=true`, `GOOGLE_DRIVE_CLIENTES_FOLDER_ID`, credenciales de servicio de Drive existentes, `SUPABASE_SERVICE_ROLE_KEY` y `CRON_SECRET`.

La API administrativa verifica sesión propia, administrador global activo/autorizado y origen de las mutaciones. Las tablas tienen RLS habilitada, sin acceso para `anon` o `authenticated`; solo accede el servidor con `service_role`. El aviso informativo [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) es intencional en estas dos tablas.

Una concesión de exclusividad en la base de datos evita que un proceso manual, programado y de consola dupliquen trabajos simultáneamente. Expira en diez minutos si un proceso se interrumpe. Los nombres estables recuperan copias cuya escritura de metadata falló. Se verifica tamaño cuando se conoce y pertenencia a la carpeta; las copias de más de treinta días se revisan gradualmente (incluido el contenido de carpetas).

## Operación y pruebas

```sh
npm run drive:monthly                              # registrar/inventariar, sin copiar en Drive
npm run drive:monthly -- --execute --all            # copiar todo lo elegible, con progreso por lote
npm run drive:monthly -- --execute --all --retry-errors
npm run drive:monthly:test
npm run typecheck
```

El inventario escribe nuevos registros pendientes. Los comandos de ejecución usan el mismo motor que la API y respetan la misma exclusividad. Código de salida 2 significa que quedaron pendientes/errores. SIGINT/SIGTERM permite terminar el lote en curso y salir. Una carpeta copiada representa una versión del sistema; puede contener varios archivos físicos.
