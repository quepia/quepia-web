# Semana 1 - Fase 0 + Fase 1 (Implementacion)

## Objetivo
Ejecutar mejoras de alto impacto sobre la base existente sin rehacer arquitectura.

## Fase 0 (Baseline y control de alcance)

### Metricas base (operativas)
- `task_move_blocked`: intentos bloqueados por WIP/subtareas/dependencias.
- `errors_shown`: errores visibles al usuario en flujos criticos.
- `review_approved`: revisiones aprobadas.
- `review_changes_requested`: revisiones con cambios solicitados.
- `client_comment_sent`: comentarios enviados por cliente.
- `asset_approved`: assets marcados como aprobados por cliente.
- `asset_changes_requested`: assets marcados con cambios solicitados.

### Instrumentacion inicial
- Archivo: `lib/sistema/experience-metrics.ts`
- Persistencia: `localStorage` por semana (reinicio automatico por week-start).
- Visualizacion inicial (admin): `DashboardOverview` muestra bloqueos y errores de la semana.

### Scope lock (semana 1)
- Incluido:
  - Sistema unificado de feedback UX (`toast` y `confirm`).
  - Dashboard KPI rapido + empty states accionables.
  - Migracion de flujos criticos para eliminar `alert/confirm` nativos.
- Excluido:
  - Integraciones externas (Slack/Drive/Calendar sync).
  - Rework profundo de arquitectura de datos.
  - Paginacion backend y hardening de API (semana 2+).

## Fase 1 (Quick wins UX/UI)

### Entregables implementados
1. Proveedores globales de UX feedback:
   - `components/ui/toast-provider.tsx`
   - `components/ui/confirm-provider.tsx`
   - Integrados en `components/layout/ClientLayout.tsx`
2. Flujos cliente/equipo migrados a toasts/confirms:
   - `components/sistema/quepia/review-interface.tsx`
   - `components/sistema/quepia/client-asset-viewer.tsx`
   - `components/sistema/quepia/calendar-view.tsx`
   - `components/sistema/quepia/kanban-board.tsx`
   - `app/cliente/[token]/page.tsx` (comentarios de calendario)
3. Mejoras de lectura y accion en dashboard:
   - KPI strip inicial.
   - Empty states con CTA.
   - Señales UX semanales para admin.
4. Empty state accionable en assets cliente:
   - Boton para limpiar filtros cuando no hay resultados.

## Riesgos y notas
- El repo ya tiene warnings/errores de lint preexistentes en modulos no tocados.
- Validacion limpia realizada sobre la base nueva:
  - `components/ui/toast-provider.tsx`
  - `components/ui/confirm-provider.tsx`
  - `components/layout/ClientLayout.tsx`
  - `lib/sistema/experience-metrics.ts`

## Criterio de exito de la semana
- El usuario recibe feedback visual consistente en acciones clave.
- Se reduce uso de modales bloqueantes nativos del navegador.
- Se obtiene baseline de friccion para priorizar semana 2.

