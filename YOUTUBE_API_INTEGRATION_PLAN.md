# Plan de Integracion YouTube API

Fecha: 2026-02-12
Estado: Documento base para implementacion futura

## Objetivo
Integrar YouTube Data API + YouTube Analytics API al sistema actual para:
- Conectar un canal de YouTube por proyecto.
- Sincronizar rendimiento de canal y videos.
- Mostrar KPIs en dashboard de proyecto y en tareas YouTube del Kanban.

## Alcance inicial (MVP)
- Conectar/desconectar canal YouTube desde un proyecto.
- Sincronizacion diaria de metricas por canal y por video.
- Vista de rendimiento en proyecto YouTube (7/28 dias + top videos).
- Vincular tarea YouTube con video publicado (`video_id`) para ver metricas dentro de la tarea.

## Fuera de alcance (fase posterior)
- Predicciones avanzadas.
- ETL historico masivo.
- Segmentaciones complejas (trafico, device, geo) en tiempo real.

## Arquitectura propuesta
- Frontend (Next.js):
  - Configuracion de integracion en vista de proyecto.
  - Dashboard de analitica en proyecto.
  - KPIs por video en `task-detail-modal`.
- Backend (Next.js API routes):
  - OAuth de Google (connect/callback/disconnect).
  - Endpoints de sync manual.
  - Endpoints de consulta agregada.
- Base de datos (Supabase/Postgres):
  - Tablas de integracion, tokens, videos y metricas diarias.
  - Tabla de corridas de sync (auditoria/errores).
- Scheduler:
  - Job periodico (cada 6-12h) para sync incremental.

## Modelo de datos sugerido
Nota: nombres tentativos para migraciones.

1. `sistema_project_integrations`
- `id` uuid pk
- `project_id` uuid not null
- `provider` text not null check (`youtube`)
- `status` text not null (`connected`, `disconnected`, `error`)
- `created_by` uuid
- `created_at`, `updated_at`
- unique (`project_id`, `provider`)

2. `sistema_youtube_channels`
- `id` uuid pk
- `integration_id` uuid not null references `sistema_project_integrations`
- `youtube_channel_id` text not null
- `title` text
- `thumbnail_url` text
- `uploads_playlist_id` text
- `connected_at` timestamptz
- unique (`integration_id`)

3. `sistema_youtube_tokens`
- `id` uuid pk
- `integration_id` uuid not null references `sistema_project_integrations`
- `access_token_encrypted` text not null
- `refresh_token_encrypted` text not null
- `scope` text
- `expires_at` timestamptz
- `last_refresh_at` timestamptz
- `token_status` text (`active`, `revoked`, `expired`)
- unique (`integration_id`)

4. `sistema_youtube_videos`
- `id` uuid pk
- `integration_id` uuid not null
- `youtube_video_id` text not null
- `youtube_channel_id` text not null
- `title` text
- `description` text
- `published_at` timestamptz
- `duration_iso8601` text
- `privacy_status` text
- `thumbnail_default_url` text
- `thumbnail_medium_url` text
- `thumbnail_high_url` text
- `url` text
- `raw_snippet` jsonb
- `raw_statistics` jsonb
- `last_synced_at` timestamptz
- unique (`integration_id`, `youtube_video_id`)

5. `sistema_youtube_channel_daily_metrics`
- `id` uuid pk
- `integration_id` uuid not null
- `day` date not null
- `views` bigint default 0
- `estimated_minutes_watched` bigint default 0
- `subscribers_gained` integer default 0
- `subscribers_lost` integer default 0
- `likes` integer default 0
- `comments` integer default 0
- `shares` integer default 0
- unique (`integration_id`, `day`)

6. `sistema_youtube_video_daily_metrics`
- `id` uuid pk
- `integration_id` uuid not null
- `youtube_video_id` text not null
- `day` date not null
- `views` bigint default 0
- `estimated_minutes_watched` bigint default 0
- `likes` integer default 0
- `comments` integer default 0
- `shares` integer default 0
- unique (`integration_id`, `youtube_video_id`, `day`)

7. `sistema_youtube_sync_runs`
- `id` uuid pk
- `integration_id` uuid not null
- `sync_type` text (`catalog`, `metrics_channel`, `metrics_video`, `full`)
- `status` text (`running`, `success`, `error`)
- `started_at`, `finished_at`
- `rows_processed` integer default 0
- `error_message` text
- `meta` jsonb

## Endpoints sugeridos
- `GET /api/integrations/youtube/connect?projectId=...`
  - Inicia OAuth.
- `GET /api/integrations/youtube/callback`
  - Intercambia code por tokens y guarda integracion.
- `POST /api/integrations/youtube/disconnect`
  - Desconecta canal y marca estado.
- `POST /api/integrations/youtube/sync`
  - Sync manual (catalogo + metricas).
- `GET /api/integrations/youtube/summary?projectId=...&range=28d`
  - KPIs agregados canal.
- `GET /api/integrations/youtube/videos?projectId=...&range=28d`
  - Tabla/lista de videos con rendimiento.
- `GET /api/integrations/youtube/video/:videoId/metrics?range=28d`
  - Detalle por video (para modal de tarea).

## Flujo OAuth (resumen)
1. Usuario entra a conectar canal desde un proyecto.
2. Se redirige a Google OAuth con scopes minimos requeridos.
3. Callback guarda tokens cifrados y metadata del canal.
4. Se dispara sync inicial corto (catalogo + ultimos 28 dias).

## Scopes recomendados
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

## Estrategia de sync
- Inicial:
  - Catalogo de videos del canal.
  - Backfill de metricas ultimos 28 dias.
- Periodico:
  - Sync incremental cada 6-12 horas.
  - Recalculo de ultimos 3 dias para corregir retrasos de datos.
- Manual:
  - Boton "Sincronizar ahora" por proyecto.

## Integracion con Kanban actual
Base ya disponible:
- Template YouTube.
- `type_metadata.youtube` en tareas.

Extensiones propuestas:
- Guardar `type_metadata.youtube.video_id`.
- Si existe `video_id`, mostrar bloque de metricas en `task-detail-modal`.
- Si existe `published_url` sin `video_id`, intentar resolver `video_id` al sincronizar.

## UI por fases
Fase A:
- Estado de conexion YouTube en header o recursos del proyecto.
- Boton conectar/desconectar/sincronizar.

Fase B:
- Tarjetas KPI (views, watch time, subs netos, likes, comments).
- Tabla de top videos (7/28/90 dias).

Fase C:
- Metricas por video dentro de tarea Kanban vinculada.

## Seguridad y cumplimiento
- Tokens solo en servidor; nunca exponer en cliente.
- Cifrado de `access_token` y `refresh_token`.
- Rotacion/refresh de tokens con manejo de expiracion.
- Registro de errores OAuth, revocaciones y estado de quota.
- RLS y control de permisos por miembros del proyecto.

## Cuota y rendimiento
- Evitar `search.list` salvo necesidad (alto costo).
- Priorizar endpoints de menor costo (`videos.list`, playlists uploads del canal).
- Cachear respuestas agregadas para dashboard.
- Limitar sync manual por ventana de tiempo para evitar abuso.

## Riesgos conocidos
- Retrasos de disponibilidad en algunas metricas recientes.
- Revocacion de consentimiento por parte del usuario.
- Cambios de cuota y limites de Google.
- Canales con gran volumen: sync mas lento sin paginacion eficiente.

## Plan de rollout
1. Migraciones SQL + tipos TS.
2. OAuth connect/callback/disconnect.
3. Sync catalogo.
4. Sync metricas diarias.
5. Dashboard de proyecto YouTube.
6. Vinculo tarea-video + KPI en modal de tarea.
7. Hardening (reintentos, observabilidad, alertas).

## Checklist ejecutable para la proxima sesion
- [ ] Crear migraciones para 7 tablas YouTube.
- [ ] Agregar tipados TS para nuevas tablas/DTOs.
- [ ] Implementar endpoints OAuth.
- [ ] Implementar servicio server para refresh de tokens.
- [ ] Implementar sync de catalogo videos.
- [ ] Implementar sync de metricas canal/video.
- [ ] Agregar cron/scheduler.
- [ ] Crear endpoints de summary y videos.
- [ ] Construir UI de integracion (connect/status/sync).
- [ ] Construir dashboard KPI + top videos.
- [ ] Enlazar `video_id` en `type_metadata.youtube`.
- [ ] Mostrar KPIs por video en `task-detail-modal`.

