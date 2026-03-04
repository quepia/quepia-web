# Plan de Implementación: App de Cliente Instalable (PWA)

Fecha: 2026-03-02  
Estado: Plan maestro para ejecución por fases

## Actualización 2026-03-04 (implementado)
- Se agregó onboarding guiado v2 en cliente con recorrido por `Calendario`, `Tareas` y `Recursos`, y botón manual `Ver guía`.
- `Tareas` ahora inicia mostrando solo pendientes por defecto, con preferencia persistida por cliente/dispositivo.
- `Recursos` mantiene agrupación por tarea y ahora se ordena por assets más recientes (nuevo → viejo), con UI simplificada.
- Se agregaron settings por acceso en admin para notificación de entregas:
  - `notify_asset_delivery`
  - `delivery_email`
- Se incorporó notificación automática por batch de subida (incluye nuevas versiones):
  - 1 email por acceso habilitado
  - Link directo `/cliente/<session_uuid>` válido 30 días
- Se agregaron migraciones para:
  - settings de notificación en `sistema_client_access`
  - timestamps de asset/version en payload de RPC cliente

## 1) Objetivo del proyecto
Convertir el portal cliente actual en una experiencia instalable en teléfono (Android/iOS) para que cada cliente pueda entrar como “app”, ver entregables y calendario de forma simplificada, y reducir la dependencia de compartir links manualmente.

## 2) Estado actual (base existente en este repo)
- Ya existe portal cliente funcional en `app/cliente/[token]/page.tsx` con tabs `Calendario`, `Tareas`, `Recursos`.
- Ya existe login OTP por email en:
  - `app/cliente/login/page.tsx`
  - `app/cliente/verify/page.tsx`
  - `app/actions/client-auth.ts`
- Ya existe sesión V2 (`sistema_client_sessions`) y RPC de datos cliente (`get_client_project_data_v2`) vía `app/api/client/data/route.ts`.
- Actualmente el acceso sigue muy centrado en token en URL (`/cliente/<token>`), incluyendo descargas/logs de assets con `token` en body.
- No hay infraestructura PWA implementada todavía (sin `manifest`, sin Service Worker, sin banner de instalación).

## 3) Problemas a resolver
- Fricción de acceso: el cliente depende de links compartidos.
- Experiencia móvil no optimizada como “app instalada”.
- Riesgo operativo por token en URL (reenvío, historial, capturas).
- Portal cliente concentrado en una página grande (`app/cliente/[token]/page.tsx`, ~1300 líneas), difícil de escalar para UX móvil por secciones.
- Falta de estrategia offline básica para consulta rápida de agenda y últimos entregables.

## 4) Resultado esperado (MVP)
Al finalizar MVP:
- El cliente instala la app web desde el navegador.
- Inicia sesión por OTP una vez y permanece autenticado por sesión segura.
- Entra siempre por una ruta fija (`/cliente/app`) sin depender de token visible en URL.
- Ve una vista simplificada móvil con:
  - Resumen
  - Entregables/recursos
  - Calendario
  - Estado de tareas
- Si no hay red, al menos puede ver último snapshot sincronizado (modo lectura).

## 5) Alcance por fases

## Fase 0: Diseño funcional y reglas de negocio (1-2 días)
Entregables:
- Definir UX mínima de la app cliente (sin features administrativas).
- Definir permisos exactos por cliente (`can_view_calendar`, `can_view_tasks`, `can_comment`).
- Definir qué módulos van al MVP y qué queda para fase posterior.

Decisiones clave:
- Mantener `OTP por email` para no agregar contraseña.
- Mantener links directos solo como fallback de soporte (no como flujo principal).
- Una vez validado OTP, mover navegación a sesión con cookie HttpOnly.

## Fase 1: Endurecer autenticación y sesión para modo “app” (2-4 días)
Objetivo:
Eliminar dependencia del token en URL para uso diario.

Cambios técnicos:
- Crear endpoint server-side para “establecer sesión de cliente” en cookie segura al verificar OTP.
- Crear endpoint de “logout cliente” que invalide sesión en DB y cookie.
- Crear helper server `resolveClientSession()` reutilizable en APIs.
- Mover APIs de cliente para priorizar cookie de sesión y usar token solo como compatibilidad temporal.

Cambios de BD recomendados:
- Revisar `sistema_client_sessions`:
  - índice por `id, expires_at`
  - índice por `client_access_id, expires_at`
- Agregar campos opcionales para control:
  - `revoked_at timestamptz`
  - `device_label text`
  - `last_ip inet` (opcional)
  - `last_user_agent text` (opcional)
- Agregar rate-limit básico OTP (tabla o contador temporal por email/IP).

Archivos objetivo:
- `app/actions/client-auth.ts`
- `app/cliente/verify/page.tsx`
- `app/api/client/data/route.ts`
- `app/api/assets/download/route.ts`
- `app/api/assets/zip/route.ts`
- `app/api/assets/log/route.ts`
- Nuevo: `lib/sistema/auth/client-session.ts` (helper central)
- Nuevo: migración SQL en `supabase/migrations/`

## Fase 2: Capa PWA instalable (2-3 días)
Objetivo:
Hacer instalable la app cliente con comportamiento nativo básico.

Cambios técnicos:
- Crear manifest:
  - `app/manifest.ts` (o `public/manifest.webmanifest`)
  - nombre corto orientado a cliente (ej: “Quepia Cliente”)
  - `display: standalone`
  - `theme_color` y `background_color`
  - icons 192/512 + máscara para Android
- Agregar metadata móvil en layout cliente:
  - `appleWebApp`
  - `formatDetection`
  - `viewport` correcto para standalone
- Implementar Service Worker:
  - cache estático (shell de app)
  - estrategia `network-first` para `/api/client/*`
  - fallback offline para shell + snapshot local
- Registrar SW solo en entorno cliente del módulo `/cliente`.
- Implementar UI de instalación:
  - banner/prompt cuando exista `beforeinstallprompt` (Android)
  - guía manual para iOS (“Compartir -> Añadir a pantalla de inicio”)

Archivos objetivo:
- Nuevo: `app/manifest.ts`
- Nuevo: `public/sw.js` (o estrategia Workbox)
- `app/cliente/layout.tsx`
- Nuevo: `components/sistema/quepia/client-install-prompt.tsx`
- Nuevo: `lib/sistema/pwa/register-sw.ts`

## Fase 3: Nueva experiencia cliente simplificada móvil (4-7 días)
Objetivo:
Separar el portal actual en una app cliente clara, rápida y enfocada.

Cambios UX/Frontend:
- Nueva ruta principal autenticada:
  - `app/cliente/app/page.tsx`
- Navegación móvil inferior (tabs):
  - `Inicio`
  - `Entregables`
  - `Calendario`
  - `Cuenta`
- Tarjeta de “Próximo hito” + “Últimos entregables”.
- Unificar lenguaje visual y reducir densidad de información.
- Mantener modal de detalle de asset/tarea, pero optimizado para touch.

Refactor recomendado:
- Extraer componentes desde `app/cliente/[token]/page.tsx` a:
  - `components/sistema/quepia/client-app/client-home.tsx`
  - `components/sistema/quepia/client-app/client-deliverables.tsx`
  - `components/sistema/quepia/client-app/client-calendar.tsx`
  - `components/sistema/quepia/client-app/client-account.tsx`
- Dejar `app/cliente/[token]/page.tsx` como “puente de compatibilidad” que:
  - valida token legado
  - crea/renueva sesión
  - redirige a `/cliente/app`

## Fase 4: Datos optimizados para móvil + modo offline (3-5 días)
Objetivo:
Mejorar tiempo de carga y resiliencia.

Cambios técnicos:
- Crear endpoint snapshot compacto para app móvil:
  - `GET /api/client/app-snapshot`
  - devuelve solo campos necesarios para home/tabs
- Mantener endpoint full (`/api/client/data`) para vistas detalladas.
- Guardar snapshot en IndexedDB/localStorage con `updated_at`.
- Mostrar estado “Última sincronización”.
- Offline read-only:
  - calendario del mes actual cacheado
  - últimos entregables visualizados

Buenas prácticas Supabase/Postgres:
- Evitar payloads gigantes para móvil (select explícito y paginado).
- Evitar consultas duplicadas por token en cada endpoint: resolver sesión una vez por request.
- Agregar índices sobre columnas de filtro frecuente (`project_id`, `due_date`, `created_at`, `expires_at`).
- Revisar políticas RLS de `sistema_client_sessions` y acceso público de funciones.

## Fase 5: Rollout controlado y migración desde links (2-3 días)
Objetivo:
Pasar a clientes actuales sin fricción.

Estrategia:
- Mantener coexistencia temporal:
  - flujo viejo: `/cliente/<token>`
  - flujo nuevo: `/cliente/login` + `/cliente/app` + instalación
- En `client-profile`:
  - priorizar botón “Invitar a instalar app”
  - dejar “Generar link directo” como soporte
- Enviar instructivo corto por WhatsApp/email con 3 pasos:
  - abrir enlace de acceso
  - validar código
  - instalar en pantalla de inicio

Métrica de éxito inicial:
- % de clientes que inician sesión por OTP sin soporte manual.
- % de clientes con app instalada (aprox por evento de instalación y user-agent standalone).
- Reducción de links directos generados por admin.

## 6) Arquitectura objetivo (resumen)

Frontend (Next.js App Router):
- `/cliente/login` y `/cliente/verify` (onboarding de sesión)
- `/cliente/app` (home instalable)
- `/cliente/[token]` (compatibilidad + redirección)

Backend (Next API + Server Actions):
- APIs cliente basadas en cookie de sesión
- fallback temporal por token legacy
- resolución centralizada de sesión

Datos (Supabase):
- `sistema_client_access` como fuente de permisos
- `sistema_client_sessions` como sesión activa por dispositivo
- RPC/queries optimizadas para snapshot móvil

PWA:
- `manifest` + `service worker` + caché controlado
- instalación Android/iOS
- offline read-only con datos recientes

## 7) Seguridad y cumplimiento
- No exponer sesión persistente en URL.
- Cookie de sesión:
  - HttpOnly
  - Secure
  - SameSite=Lax o Strict (según compatibilidad)
- Rotación de sesión en login crítico.
- Revocación manual de sesión desde panel admin (fase 2/3 recomendada).
- OTP con expiración corta (15 min ya implementado) + límites de intentos.
- Auditoría de accesos (ya existe `logAssetAccess`; extender para login/instalación).

## 8) Plan de implementación detallado por archivo (propuesta)

1. Autenticación/sesión:
- `app/actions/client-auth.ts`: emitir sesión + crear cookie segura.
- `app/cliente/verify/page.tsx`: consumir verificación y redirigir a `/cliente/app`.
- `app/cliente/login/page.tsx`: contemplar estado “sesión activa”.
- Nuevo `app/api/client/logout/route.ts`.

2. Datos cliente:
- `app/api/client/data/route.ts`: soportar cookie de sesión nativa.
- Nuevo `app/api/client/app-snapshot/route.ts`.
- `lib/sistema/hooks/useCalendar.ts`: separar métodos legacy vs métodos de app autenticada.

3. Assets:
- `app/api/assets/download/route.ts`
- `app/api/assets/zip/route.ts`
- `app/api/assets/log/route.ts`
Cambiar a sesión de cookie como fuente principal y token como fallback temporal.

4. PWA:
- `app/manifest.ts`
- `public/sw.js`
- `app/cliente/layout.tsx`
- Nuevo componente de prompt de instalación.

5. UI móvil:
- Nuevo `app/cliente/app/page.tsx`
- Nuevos componentes desacoplados desde `app/cliente/[token]/page.tsx`.

6. Admin para adopción:
- `components/sistema/quepia/client-profile.tsx`
Agregar CTA principal de instalación y material de onboarding.

## 9) Checklist ejecutable
- [ ] Crear migración de sesiones (revocación, metadata de dispositivo, índices).
- [ ] Implementar helper server `resolveClientSession`.
- [ ] Implementar cookie de sesión segura post-OTP.
- [ ] Implementar `/cliente/app` con guard de sesión.
- [ ] Implementar `manifest` + íconos + metadata PWA.
- [ ] Implementar `service worker` con cache de shell + snapshot.
- [ ] Crear endpoint `/api/client/app-snapshot`.
- [ ] Refactor de portal cliente por módulos reutilizables.
- [ ] Mantener compatibilidad `/cliente/[token]` con redirección al flujo nuevo.
- [ ] Incorporar telemetría de instalación, sesión y uso.
- [ ] QA móvil (Android Chrome + iOS Safari) en red normal y offline.
- [ ] Rollout gradual (piloto con 3-5 clientes reales).

## 10) QA y criterios de aceptación

Criterios funcionales:
- Cliente puede instalar app en Android e iOS.
- Cliente ingresa por OTP y vuelve a entrar sin pedir link cada vez.
- Cliente puede ver entregables, tareas y calendario en móvil de forma fluida.
- Si pierde conexión, ve último contenido sincronizado (modo lectura).

Criterios técnicos:
- Lighthouse PWA >= 85 en `/cliente/app`.
- Tiempo de carga inicial en 4G <= 3.5s (objetivo).
- Errores de sesión expiradas manejados con redirección limpia a login.
- Sin regresión en flujo legacy de links durante transición.

## 11) Riesgos y mitigaciones
- Riesgo: iOS no dispara prompt automático de instalación.
  - Mitigación: guía visual en la app con pasos específicos para Safari.
- Riesgo: múltiples proyectos por mismo email (hoy se toma el primero).
  - Mitigación: agregar selector de proyecto post-OTP (fase 1.5 recomendada).
- Riesgo: cache mostrar datos viejos.
  - Mitigación: sello de “última actualización” + botón “reintentar sincronización”.
- Riesgo: deuda técnica por coexistencia legacy.
  - Mitigación: fecha de retiro del flujo `/cliente/[token]` tras adopción >= 80%.

## 12) Roadmap sugerido (estimado)
- Semana 1: Fase 0 + Fase 1
- Semana 2: Fase 2 + base de Fase 3
- Semana 3: Fase 3 completa + Fase 4
- Semana 4: Fase 5 (piloto, ajustes, despliegue general)

## 13) Decisiones pendientes antes de empezar
- Definir si el login OTP debe permitir elegir proyecto cuando un email tiene más de uno.
- Definir si el modo offline solo lectura alcanza para MVP o si se requiere acciones offline (no recomendado para primera versión).
- Definir política de expiración de sesión (30 días actual vs 7/14 días).
