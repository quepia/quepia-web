# Quepia: SEO, contenido y conversión — 5 de octubre de 2026

## Cambios implementados

- Inicio: propuesta provincial concreta, conservación de “(RE)INVENTÁ TU MARCA”, acceso a trabajos reales y portfolio antes de los servicios. Cada área tiene enlaces a sus servicios, con proyectos como acceso secundario.
- Se confirmaron los siete servicios en `lib/seo/services.ts`: redes sociales, producción audiovisual, fotografía de producto e inmobiliaria, branding, diseño gráfico, dron y packaging. No se agregaron servicios nuevos ni URLs por localidad.
- Título del inicio orientado a Córdoba; redes sociales y branding tienen intención provincial. Carlos Paz sigue siendo la sede física. Las páginas territoriales mantienen objetivos distintos.
- Se eliminaron placeholders en territorios, rubros, casos, carousel y footer. Cuando no hay ciudad confirmada se muestra una selección del portfolio, sin atribuir ubicación. Se eliminaron las referencias públicas a Supabase.
- Los casos Rohi Sommiers, Onix y Mike Donas incorporan necesidad de comunicación, trabajo realizado, entregables y resultado observable, respaldados por sus descripciones publicadas. Se conserva el texto administrable original. Si se modifica o retira la descripción fuente, el resumen correspondiente deja de mostrarse. No se agregaron cifras ni testimonios.
- Se aclaró el enfoque de Esencial, Plus y Premium conservando sus prestaciones existentes. No se agregaron precios, cantidades, revisiones o plazos.
- Contacto: encabezado más corto, formulario primero, sin video decorativo ni marquee antes del formulario. Campos obligatorios: nombre, email o WhatsApp, servicio y mensaje. Empresa, ciudad e inicio quedan opcionales; desaparece el presupuesto. Plan visible únicamente con un plan válido en la URL.
- Todas las páginas de servicios incluyen formulario con servicio preseleccionado, CTA hacia ese formulario, WhatsApp y trabajos relacionados. En dron, los trabajos se presentan expresamente como producciones audiovisuales relacionadas; no se afirma que todo proyecto de video contenga vuelos.
- Servidor: validación de ambas vías de contacto, honeypot, controles de origen/tamaño, rechazo de planes/servicios inválidos y éxito únicamente con identificador de Resend. El correo permite responder por email o WhatsApp.
- Medición: `generate_lead` se dispara tras la respuesta exitosa del servidor; la recarga de /gracias no lo repite. `click_whatsapp`, `click_phone` y `click_email` continúan separados. No se agregaron etiquetas ni IDs. El formulario protege contra doble envío mientras procesa la solicitud.
- UTM y gclid/gbraid/wbraid se conservan en sessionStorage y acompañan el correo de consulta. Se permite solamente esa lista de parámetros y se limita su longitud; los campos personales no se envían a Analytics. Se conserva la atribución durante la navegación interna.
- Accesibilidad: foco visible, contraste de campos/etiquetas, áreas táctiles, alternativas estáticas del video principal y reducción de movimiento. WhatsApp flotante se oculta en contacto y cuando el formulario de servicio es visible. El video del proceso utiliza el componente existente que respeta movimiento reducido y pausa fuera de pantalla.
- Datos estructurados: dirección administrable conservada, sin dirección inventada ni sede en Capital. Se retiraron horarios fijos del JSON-LD que no estaban vinculados a la configuración. Catálogo estructurado consistente con los servicios confirmados y cobertura provincial. Robots excluye OAuth y el endpoint de envío; sitemap mantiene URLs y fechas reales.

## Verificación

- `pnpm typecheck`: aprobado.
- `pnpm build`: compilación de producción aprobada; persisten advertencias existentes del repositorio (tipos any, hooks, imágenes y fuente externa). Sin errores bloqueantes.
- `node --test tests/public/contact.test.mjs`: 5 pruebas aprobadas. Email/WhatsApp mínimos, datos opcionales, plan válido, validación, spam, origen, errores del proveedor, configuración faltante, atribución permitida y eventos separados sin datos personales.
- Prueba real de proveedor: endpoint ejecutado localmente con la plantilla real y Resend. Remitente de prueba `onboarding@resend.dev`, destinatario exclusivo `delivered@resend.dev`: HTTP 200, ID aceptado. No se envió al buzón de Quepia. Esto confirma aceptación por la API; no equivale a verificar entrega al buzón comercial. Referencia oficial: https://resend.dev/.
- `routes.json`: las 36 rutas del sitemap respondieron HTTP 200, con un único H1, canonical, sin placeholders y sin enlaces internos fuera del sitemap. Se confirmó que los tres casos muestran el resumen estructurado.
- Navegador: contacto en escritorio y móvil (390 × 844), elección email/WhatsApp, bloqueo del formulario vacío con foco en Nombre, preselección de branding y Plus, plan ausente en contacto normal y servicio seleccionado en cada formulario individual. Se revisaron inicio, precios, servicios y tres territorios sin desbordamientos horizontales ni imágenes rotas observadas.
- Rendimiento: muestra de HTML de inicio publicado: 164.418 bytes, HTTP 200, 0,519 s de descarga. Inicio local de producción: 164.943 bytes, 9 ms en primera lectura de la auditoría; contacto 41.021 bytes y branding 74.160 bytes. Esos tiempos corresponden a entornos distintos y NO se usan para afirmar una mejora de velocidad. No se atribuye un problema a animaciones o videos sin métricas de campo. Faltan mediciones de Lighthouse/Core Web Vitals en un entorno de preview publicado para comparar condiciones equivalentes.

## Pendientes externos

1. Configurar/confirmar `EMAIL_FROM` o `RESEND_FROM` con un remitente definitivo y dominio autorizado en Resend. No estaban presentes en `.env.local`; la clave existente sí permitió la prueba con remitente de prueba. Verificar `CONTACT_FORM_TO` en producción; la previsualización local utiliza exclusivamente el buzón de prueba.
2. Google Analytics / Google Tag Manager: no hay IDs configurados en este entorno. Elegir el sistema ya preparado (`NEXT_PUBLIC_GTM_ID` o una de las variables de etiqueta de Google existentes), configurar eventos y conversiones en la cuenta y verificar que GTM no replique las etiquetas directas. Meta Pixel ya existe y se conserva.
3. Search Console: no hay conector ni datos de consultas accesibles en esta sesión. Falta `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` en el entorno local; confirmar propiedad y sitemap en la cuenta. Las búsquedas por servicio se tratan como hipótesis, sin afirmar demanda ni posiciones.
4. La dirección física se toma de la configuración existente. Si no está cargada, se publica solo Villa Carlos Paz. Confirmar atención presencial antes de agregar instrucciones de visita. No se mantiene una promesa de 24 horas sin confirmación del negocio.
5. Logos/testimonios permanecen vacíos: requieren material y autorización. Para un ejemplo específicamente aéreo de dron, confirmar un proyecto cuya descripción o material publicado lo documente.

## Cómo revisar antes de publicar

La previsualización de producción está en http://localhost:3105. No se desplegó ni publicaron cambios.

Para reconstruir y ejecutar de forma segura (sin enviar pruebas al buzón comercial):

```sh
pnpm build
CONTACT_FORM_TO=delivered@resend.dev EMAIL_FROM=onboarding@resend.dev pnpm start --port 3105
```

Detener el servidor antes de ejecutar otro build: ambos comparten `.next`.

Revisar inicio, /contacto, /contacto?servicio=branding-e-identidad&plan=Plus, las siete páginas de servicios, /cordoba, /villa-carlos-paz, /rubros/gastronomia y los casos destacados. Probar teclado, móvil y mensajes de error. La política de privacidad sigue accesible. Las etiquetas existentes pueden medir las interacciones del preview; para pruebas de conversiones usar las herramientas de depuración de la cuenta.

Pruebas reproducibles:

```sh
node --test tests/public/contact.test.mjs
CONTACT_PROVIDER_TEST=1 EMAIL_FROM=onboarding@resend.dev node --env-file=.env.local scripts/verify-public-contact.mjs
```

El segundo comando usa el destinatario de prueba de Resend de forma fija y nunca el buzón comercial. No modificar `.env.local` para esta prueba.

## Páginas y archivos

Páginas afectadas: inicio; contacto; catálogo y siete servicios; tres territorios (componente y datos compartidos); tres rubros; casos del portfolio; precios (planes compartidos); páginas públicas con footer, foco y medición compartidos.

Archivos modificados por esta tarea:

- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/robots.ts`.
- `app/contacto/ContactoClient.tsx`, `app/contacto/page.tsx`, `app/contacto/enviar/route.ts`.
- `app/servicios/page.tsx`, `app/servicios/[slug]/page.tsx`, `app/rubros/[slug]/page.tsx`, `app/trabajos/[slug]/page.tsx`.
- `components/contact/ContactFormCard.tsx`, `components/emails/ContactFormEmail.tsx`, `components/analytics/MarketingAnalytics.tsx`.
- `components/home/HeroSection.tsx`, `HeroVideoBackground.tsx`, `ServicesGrid.tsx`, `HomeCarousel.tsx`, `PlansSection.tsx`, `ProcessSection.tsx`, `CTASection.tsx`, `DroneService.tsx`.
- `components/layout/Footer.tsx`, `components/seo/LocationPage.tsx`, `PublicContent.tsx`, `FloatingWhatsApp.tsx`.
- `lib/seo/landing-pages.ts`, `lib/seo/services.ts`, nuevos `lib/seo/campaign-attribution.ts` y `lib/seo/case-studies.ts`.
- Nuevos `tests/public/contact.test.mjs`, `scripts/verify-public-contact.mjs` y este directorio de auditoría.

Se preservaron los cambios previos en el sistema interno, dependencias y configuración del proyecto.
