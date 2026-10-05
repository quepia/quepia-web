# Mejoras SEO y conversión — seo-mejoras

Solo sitio público. Cambios previos del sistema interno conservados y excluidos de los commits SEO. No se aplicaron cambios ni correcciones a la base de producción. No se publicó ni desplegó el sitio.

## Archivos y cambios

- `app/trabajos/[slug]/page.tsx`, `lib/seo/projects.ts`, `projects-slug.ts`: 16 casos desde Supabase, metadata, galerías, schema CreativeWork y enlaces a servicios. Slug derivado de título + UUID sin migración; las tildes no cambian el slug. revalidate declarado de 300 segundos y caché de consulta (el layout puede reducir la revalidación efectiva a 60 segundos); nuevos casos pueden generarse al solicitarlos.
- `components/home/ServicesGrid.tsx`, `HomeCarousel.tsx`, `app/trabajos/works-client.tsx`: categorías correctas y navegación a casos; enlaces rastreables del portfolio. Eliminadas cifras de impacto de respaldo sin fuente.
- `lib/seo/public-copy.ts`: tildes corregidas al mostrar proyectos sin escribir en Supabase. `app/page.tsx` y `app/trabajos/page.tsx` utilizan la misma corrección.
- `lib/seo/services.ts`, `app/servicios/[slug]/page.tsx`: siete servicios, 558–582 palabras de contenido principal cada uno, cuatro FAQ, alcance, proceso, cobertura, casos y CTA. El catálogo público es editorial y evita promesas no confirmadas del CMS.
- `app/servicios/page.tsx`, `ServiciosClient.tsx`: índice con descripciones ampliadas y enlaces a servicios. Email marketing, SEO/SEM y diseño industrial quedan comentados para revisión.
- `lib/seo/landing-pages.ts`, `app/rubros/[slug]/page.tsx`, `components/seo/LocationPage.tsx` y páginas `villa-carlos-paz`, `cordoba`, `valle-de-punilla`: tres rubros respaldados por clientes indicados y tres zonas con contenido diferente. Sin atribuir ciudades a partir de nombres.
- `components/seo/JsonLd.tsx`, `PublicContent.tsx`: schema con serialización segura, breadcrumbs, FAQ, tarjetas de casos y CTA compartidos.
- `app/layout.tsx`: ProfessionalService/LocalBusiness, cobertura provincial, teléfono, eliminación de keywords y fecha de fundación no confirmada; verificación de Search Console por variable.
- `app/page.tsx`, `components/home/HeroSection.tsx`: title, description y subtítulo local manteniendo H1 y estilo. Eliminada cifra de proyectos sin respaldo.
- `app/sitemap.ts`: precios, servicios, rubros, zonas y todos los casos. No incluye gracias. Omite lastmod sin fecha real. `app/robots.ts` ya apunta al sitemap y no necesitó cambios.
- `components/layout/Footer.tsx`: WhatsApp, teléfono, dirección pendiente y enlaces a servicios y zonas. Eliminado `/terminos`, que no existe.
- `components/about/AboutClient.tsx`: oculta URLs de ejemplo y añade nombres accesibles a redes; badge actualizado. La bio propuesta está en `bio-lautaro-propuesta.md`; aún no publicada.
- `lib/seo/social-proof.ts`, `components/seo/SocialProof.tsx`: testimonios y logos configurables, reutilizados en home, índice/detalles de servicios y contacto; vacío = oculto.
- `components/contact/ContactFormCard.tsx`, `app/contacto/enviar/route.ts`: empresa, ciudad, presupuesto, inicio, plan y servicio; precarga por query, validación cliente/servidor, carga y errores. Ruta pública independiente del sistema de correo interno, honeypot y comprobación de origen. Confirmación solo con ID real de Resend; no simula éxito.
- `components/emails/ContactFormEmail.tsx`: ejemplo de branding y mensaje con los nuevos datos. Se mantiene la plantilla existente.
- `app/contacto/ContactoClient.tsx`: WhatsApp principal, FAQ provincial y de dron, schema FAQ y prueba social.
- `app/gracias/page.tsx`: noindex, confirmación, WhatsApp y tres casos. Conversión solo si existe marcador de envío exitoso; visitas directas y recargas no suman leads.
- `components/seo/FloatingWhatsApp.tsx`, `components/layout/ClientLayout.tsx`, `components/home/CTASection.tsx`: acceso público a WhatsApp con contexto del servicio; rutas internas excluidas.
- `components/analytics/MarketingAnalytics.tsx`, `lib/marketing-analytics.ts`: GA4/GTM por entorno, preservación de Meta, eventos generate_lead, click_whatsapp, click_email, click_phone; página y servicio, sin enviar contenido del formulario ni email a Analytics.
- `components/seo/AmbientVideo.tsx`, `components/home/HeroVideoBackground.tsx`, videos de cards y fondos: poster, preload none, pausado fuera de pantalla; fondos secundarios estáticos en móvil/reduced motion. Hero móvil 964 KB y poster 152 KB derivados del video existente. Se conserva el fondo de escritorio y se difiere su descarga.

## Datos que tenés que completar

1. `[COMPLETAR: dirección]` y confirmar si se atienden visitas. Hasta confirmarla se omite streetAddress del schema; no se envía un placeholder como dirección real.
2. `[COMPLETAR: rangos de presupuesto en ARS y fecha de vigencia]` en `lib/seo/contact-options.ts`. Por ahora: «Prefiero definirlo en la consulta».
3. Ciudades confirmadas de los proyectos. No hay campo ciudad hoy; las páginas de zona muestran `[COMPLETAR: casos de esta zona con ciudad confirmada]` hasta tener los datos.
4. Casos faltantes: Camping La Ribera y Nueva Generación Turismo no aparecen en los 16 proyectos visibles con la clave pública. Subirlos o confirmar qué proyecto corresponde; no se inventaron casos.
5. Testimonios autorizados (cita, nombre y cargo opcional) y archivos de logos con permiso de uso en `lib/seo/social-proof.ts`.
6. Aprobar o ajustar la bio propuesta de Lautaro. La actual se conserva mientras tanto.
7. URLs reales de redes del equipo: URLs https completas; los tres ejemplos indicados se ocultan.
8. `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`; ver `medicion.env.example`.
9. `EMAIL_FROM` o `RESEND_FROM` con remitente validado en Resend y destino `CONTACT_FORM_TO`. La clave de Resend está presente localmente; falta remitente explícito. Sin él, el endpoint devuelve 503.
10. Descripciones faltantes de casos y casos de servicios sin proyectos visibles: se muestran placeholders cuando corresponde.
11. El Instagram configurado y verificado en contacto es `@quepiastudio`. Se conserva esa configuración.

## SQL propuesto (sin aplicar)

- `correcciones-proyectos.propuesta.sql`: actualizaciones exactas por UUID y texto previo para no pisar ediciones posteriores; tildes, sin cambiar contenido factual.
- `campos-proyectos.propuesta.sql`: ciudad y updated_at opcionales con trigger de cambios reales. Las fechas históricas quedan NULL. No agrega slug y no afecta RLS ni datos internos.
- Ambos terminan en ROLLBACK. Revisarlos, crear una migración formal con CLI y reemplazar por COMMIT solo al aprobar. No colocados en migrations para evitar aplicación accidental.

## Configuración de medición

Si se configura GTM, el contenedor es el único responsable de cargar GA4. Crear Google tag con el ID de GA4; no agregar un segundo script manual. Sin GTM, `NEXT_PUBLIC_GA_ID` carga GA4 directamente. Se mantienen los alias existentes de ID Google.

En GTM crear triggers de evento personalizado para `generate_lead`, `click_whatsapp`, `click_email`, `click_phone` y `virtual_page_view`. Mapear `page`/`page_path`, `page_location`, `service` y `lead_source` según corresponda. Para navegación inicial usar la carga de página y para cambios de ruta `virtual_page_view`; evitar también un trigger History Change si duplicaría pageviews. Meta conserva PageView y Lead.

En GA4 comprobar DebugView, marcar generate_lead como evento clave y vincular Google Ads para importarlo. Clicks son microconversiones: definir su uso en Ads antes de incluirlos en pujas. Esto requiere IDs y acceso a las cuentas; no se modificaron cuentas externas. Antes de invertir probar un envío real con remitente validado y confirmar una sola conversión en GA4/Meta.

FAQPage coincide con el contenido visible. Google puede no mostrar resultados enriquecidos de FAQ para un sitio comercial, aun cuando el marcado sea válido. Verificar después de desplegar las URLs finales en Rich Results Test y Search Console.

## Checklist verificado

- [x] Build de producción sin errores. Hay advertencias previas del repositorio y la advertencia existente de fuentes externas; Node local 24, proyecto declara Node 22.
- [x] Typecheck sin errores y lint de archivos públicos sin errores.
- [x] 36 URLs del sitemap responden 200; siete servicios, tres rubros, tres zonas y 16 casos.
- [x] 61 enlaces internos verificados sin errores; una sola H1 por página auditada.
- [x] 110 bloques JSON-LD parseados en las páginas finales.
- [ ] Rich Results Test oficial: Google solicitó iniciar sesión («Inicia sesión e inténtalo de nuevo»). No se declara validación oficial completada. Repetir con URLs publicadas y sesión de Google.
- [x] Lighthouse SEO: home 100, servicios 100, contacto 100, Chrome headless sobre servidor local de producción, Lighthouse 13.5.0. Resultado SEO; no equivale a un puntaje de rendimiento.
- [x] Precarga de plan Plus y servicio de dron verificada en navegador.
- [x] Validación 400, origen ajeno 403 y error de envío sin remitente, sin falsa confirmación.
- [x] Flujo de éxito del frontend verificado con respuesta simulada solo en navegador: redirección, noindex y consumo único del marcador.
- [x] Eventos GA4 y GTM verificados con funciones de tracking y emisores simulados, sin PII ni doble emisión GA4/GTM.
- [x] SQL validado en PostgreSQL en memoria (PGlite); ROLLBACK confirmado.
- [ ] Envío real a correo y recepción: pendiente de remitente validado. No se enviaron consultas de prueba reales.
- [ ] DebugView, importación de conversiones a Google Ads y verificación Search Console: pendiente de IDs y configuración de cuentas.

Datos compactos de comprobación en `verification.json`. No se prometen resultados de ranking; estas pruebas verifican implementación y rastreabilidad local.
