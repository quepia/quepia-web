# Registro de mejoras SEO

## 2026-10-06 — Grokbot — metadatos de servicios, estrategia de marca, llms.txt y datos estructurados

- Registro: realizado el 2026-10-08 por Grokbot sobre cambios publicados el 2026-10-06 (horas en ART, UTC-3).
- `79af4d9` — og/twitter en servicios.
  - Evidencia: las 7 páginas `/servicios/*` definían `openGraph` sin imagen; Next reemplazaba el del layout y se perdían `og:image`, `og:locale` y `og:site_name`, y heredaban el `twitter:title` genérico "Quepia - (RE)INVENTÁ TU MARCA".
  - Cambio: `type`, locale es_AR, `siteName`, `og:image` (`/og-image.jpg`, 1024×537, alt por servicio), `og:title` por servicio y bloque `twitter` `summary_large_image` con título, descripción e imagen.
  - Archivo: `app/servicios/[slug]/page.tsx`.
- `6ed2fac` — marketing como estrategia de marca, sin referencias a pauta.
  - Motivo: pedido de la usuaria; en Quepia "marketing" significa estrategia de marca, nunca gestión de pauta.
  - Cambio: la marquesina muestra "Estrategia de marca" y la consulta de servicios de la home trae solo `titulo, orden` (las features viejas del registro "Marketing" ya no viajan en el payload); "Comunidad & contenido orgánico"; plan Premium con "Creativos para campañas (diseño de piezas)"; descripción por defecto, og:description y JSON-LD con estrategia de marca y contenido orgánico; llms.txt sin "Marketing Digital".
  - Archivos: `app/page.tsx`, `lib/seo/public-services.ts`, `components/home/MarqueeSection.tsx`, `components/home/ServicesGrid.tsx`, `components/home/PlansSection.tsx`, `app/layout.tsx`, `public/llms.txt`, `supabase-seed.sql` (solo seed del repo; la base de producción no se tocó).
- `e5c16e4` — llms.txt, datos estructurados y nombre de marca "Quepia - Consultora Creativa".
  - Cambio: llms.txt reescrito (redes como servicio principal, enlaces a servicios, rubros, zonas, casos, precios y contacto, Instagram @quepiastudio, aclaración de que no se gestiona pauta); JSON-LD con `name` "Quepia - Consultora Creativa", `foundingDate` 2020, `sameAs` solo Instagram, `knowsAbout`, `areaServed` (Villa Carlos Paz, Punilla, Córdoba) y catálogo de servicios con URLs; `siteName` y textos de "agencia creativa" a "consultora creativa"; `/sobre-nosotros` sin perfiles personales de relleno.
  - Archivos: `app/layout.tsx`, `app/page.tsx`, `app/servicios/[slug]/page.tsx`, `app/servicios/page.tsx`, `app/sobre-nosotros/page.tsx`, `components/about/AboutClient.tsx`, `components/home/HeroSection.tsx`, `lib/instagram.ts`, `lib/seo/landing-pages.ts`, `public/llms.txt`, `supabase-config.sql`.
- `fe51700` — completa `e5c16e4`.
  - Evidencia: los datos del equipo seguían llegando al cliente con enlaces de relleno (`linkedin.com/in/camila`) aunque ya no se mostraban; la home pisaba `siteName`/locale del layout.
  - Archivos: `app/page.tsx`, `app/sobre-nosotros/page.tsx`.
- Motivo general: metadatos sociales correctos al compartir, identidad de marca coherente y descripción fiel de los servicios para personas y asistentes. No implica un aumento de ranking garantizado.
- Validación previa al push de `79af4d9` y `6ed2fac`: Node 22 con `pnpm install --frozen-lockfile`, typecheck y lint de los archivos tocados correctos; `pnpm build` correcto (solo advertencias previas), contra un mock vacío de Supabase y sin credenciales; HTML generado revisado. `git pull --rebase` antes de cada push, sin force push.
- Validación de `e5c16e4` y `fe51700`: build de producción correcto en Vercel (`dpl_6AL9apxfcAkUpVuhEMJpRiR3S4xB` y `dpl_JCdppUUBE6Ge9xoWadyby8mr6SpS`, READY) y verificación en vivo del 2026-10-08 (ver abajo). La validación local (lint, typecheck y build) de estos dos commits no quedó registrada.

### Verificación de publicación (Grokbot)

- Vercel, producción READY con el SHA esperado: `79af4d9` → `dpl_72VXZRxYMbrrFMX3xnBtoHwi4xmF` (06/10 16:13); `6ed2fac` → `dpl_5gPnu9usaznXTUXxMAHFud3xXz8s` (17:47); `e5c16e4` → `dpl_6AL9apxfcAkUpVuhEMJpRiR3S4xB` (18:01); `fe51700` → `dpl_JCdppUUBE6Ge9xoWadyby8mr6SpS` (18:07).
- Revalidado en producción el 2026-10-08 (deploy vigente `eb73459`, `dpl_EPY8rDVH38ZUsExRsfkk5vDhW9CK`):
  - Las 7 páginas `/servicios/*`: HTTP 200, `og:image` `https://quepia.com/og-image.jpg`, `og:locale` es_AR, `og:site_name` "Quepia - Consultora Creativa" y `twitter:title` propio de cada servicio.
  - Home: "Estrategia de marca", "Comunidad & contenido orgánico" y "Creativos para campañas" presentes; sin "Email marketing", "SEO/SEM", "Publicidad tradicional", "marketing digital" ni "campañas publicitarias". `/precios` coherente.
  - Home: JSON-LD parseable (`LocalBusiness`/`ProfessionalService`, nombre, `foundingDate`, `sameAs`, `areaServed`, `knowsAbout` y catálogo de servicios) y `og:site_name` "Quepia - Consultora Creativa".
  - `/sobre-nosotros`: HTTP 200, sin `linkedin.com/in/` en HTML ni payload; JSON-LD parseable.
  - `/llms.txt`: HTTP 200, marca, enlaces y aclaración sobre pauta presentes.
- Resultado: los cuatro commits siguen publicados y vigentes; las mejoras posteriores de Codex (fichas, páginas locales y rubros) los conservan.

## 2026-10-07 — Codex — ejecución de la tarde adelantada

- Alcance: fichas públicas `/trabajos/[slug]`.
- Evidencia: la ficha de Logo e Identidad CEL respondía HTTP 200, pero `twitter:title`, `twitter:description` y `twitter:image` mostraban la portada genérica; faltaban `og:site_name`, `og:locale`, `og:type` y texto alternativo de la imagen social.
- Cambio: título, descripción e imagen específicos del proyecto en Twitter y Open Graph; identidad de Quepia y locale es_AR explícitos; imagen de marca como respaldo si no existe galería; texto alternativo descriptivo.
- Motivo: presentar el caso correcto al compartirlo y mantener metadatos coherentes con su contenido. No implica un aumento de ranking garantizado.
- Archivo: `app/trabajos/[slug]/page.tsx`.
- Validación: lint del archivo modificado, comprobación de tipos y build completo correctos (el build mantiene advertencias previas en otros archivos). La compilación cloud requirió NODE_USE_ENV_PROXY=1. Sitemap de producción: 16 fichas públicas.
- Publicación: pendiente de verificar tras integrar este commit; el resultado se agregará en una entrada de verificación.
- Coordinación: conservar las mejoras previas y evitar reemplazar estos metadatos por los genéricos de portada.

### Verificación de publicación

- Commit de implementación: `adefb7f9f5389ff502d13b847c970f2fdfd44367`.
- Vercel: despliegue `dpl_M694swqRP7ATbMdJK5AkfMqkHEQ2`, producción READY y alias `quepia.com`, con el SHA esperado.
- HTML del build: las 16 fichas generadas tienen identidad y locale explícitos, títulos y descripciones coherentes entre Open Graph y Twitter, imagen del proyecto y texto alternativo.
- Producción: Logo e Identidad CEL, Rohi Sommiers y Onix - Retrato y Productos respondieron HTTP 200 y pasaron esas comprobaciones de metadatos.
- Resultado: corrección publicada y verificada; sin regresiones detectadas en las fichas revisadas. Registro realizado por Codex.

## 2026-10-07 — Codex — búsqueda local y asistentes de IA

- Alcance: `/villa-carlos-paz`, `/cordoba` y `/llms.txt`.
- Problema: las páginas locales no ofrecían un resumen directo ni preguntas frecuentes locales; sus descripciones se cortaban desde el primer párrafo y las tarjetas sociales heredaban información genérica de la portada.
- Cambio: resúmenes visibles con base real en Villa Carlos Paz y cobertura de Córdoba Capital/provincia, ocho preguntas y respuestas locales sobre servicios, logística y presupuesto; metadata local completa y consistente; datos Service vinculados a la organización y al área atendida; FAQPage con respuestas iguales al contenido visible; índice llms.txt ampliado con referencias a estas páginas.
- Fuente factual: páginas de servicios y zonas ya publicadas. La gestión de redes y contenido orgánico mantiene la prioridad. No se añaden sucursales, cifras ni promesas de posicionamiento.
- Archivos: `lib/seo/local-search.ts`, `components/seo/LocationPage.tsx`, `app/villa-carlos-paz/page.tsx`, `app/cordoba/page.tsx`, `public/llms.txt`.
- Validación: lint de archivos modificados y typecheck correctos; build completo correcto con NODE_USE_ENV_PROXY=1 (advertencias previas en otros archivos). HTML generado de ambas páginas verificado: resumen y cuatro respuestas visibles por página, JSON-LD coincidente con el contenido, canonical y metadata locales. Publicación pendiente de verificar tras integrar el commit.
- Propósito: facilitar la comprensión y recuperación de información local por personas y asistentes; llms.txt es complementario y no garantiza citas ni recomendaciones.

### Verificación de publicación local

- Commit de implementación: `df24ba8fcf104de1e50910cda92c4ff74cb3e86b`.
- Vercel: despliegue `dpl_2EwnxvNhapV7og9xkM3B9DAiaCM6`, producción READY con el SHA esperado y alias `quepia.com`.
- `/villa-carlos-paz` y `/cordoba`: HTTP 200, resumen y cuatro preguntas/respuestas presentes en HTML visible por página, datos Service y FAQPage coherentes, vínculo al proveedor `https://quepia.com/#organization`, canonical correcto, locale es_AR y robots index/follow.
- `/llms.txt`: HTTP 200 y sección de cobertura local publicada con enlaces a ambas páginas.
- Resultado: mejoras publicadas y verificadas por Codex. No se ha medido todavía un cambio en citas, recomendaciones o tráfico de asistentes.

## 2026-10-08 — Codex — páginas por rubro y cobertura local

- Evidencia en producción: `/rubros/turismo-y-hoteleria` respondía HTTP 200 pero `og:url` apuntaba a la portada; Open Graph y Twitter mostraban el título y descripción genéricos del inicio. La misma plantilla se utiliza para inmobiliarias y gastronomía.
- Alcance: las tres páginas `/rubros/*` existentes y sus referencias en `/llms.txt`.
- Cambio: metadata específica y URL social coincidente con canonical; resúmenes visibles de servicios por rubro, base en Villa Carlos Paz y atención de Córdoba; enlaces contextuales a las dos páginas locales; datos WebPage con descripción igual al resumen y referencia a la organización; descripciones útiles de los rubros en llms.txt.
- Fuente factual: servicios y contenido de los rubros ya publicados. Se conservan los casos reales y el diseño. No se añaden páginas, clientes, sucursales ni métricas.
- Archivos: `app/rubros/[slug]/page.tsx`, `lib/seo/landing-pages.ts`, `public/llms.txt`.
- Validación: lint y typecheck correctos. Build completo correcto con NODE_USE_ENV_PROXY=1 (advertencias previas en otros archivos). HTML de los tres rubros verificado: metadata, canonical/og:url, resumen visible, datos WebPage y enlaces locales. Publicación pendiente de verificar tras integrar el commit.
- Motivo: corregir la identidad de las URLs compartidas y facilitar la comprensión de servicios y cobertura local por personas y asistentes.

### Verificación de publicación por rubro

- Commit de implementación: `9b5ef86e981933c338aad28afe86502bf1f08a3c`.
- Vercel: `dpl_44kzK4932Ha94ghMsJpUhPj6h1z8`, producción READY con el SHA esperado y alias `quepia.com`.
- Los tres rubros respondieron HTTP 200 en producción: URL Open Graph correcta, títulos y descripciones específicos coincidentes entre tarjetas sociales, robots index/follow, datos WebPage y resumen visible coherentes, enlaces a Villa Carlos Paz y Córdoba.
- `/llms.txt`: HTTP 200 con las descripciones actualizadas de los rubros.
- Resultado: publicado y verificado por Codex. No se han medido cambios en posiciones, tráfico o citas de asistentes.

## 2026-10-08 — Grokbot — verificación del teléfono de contacto

- Alcance: número nuevo +54 9 3517 18-6433 (`https://wa.me/5493517186433`) frente al anterior 351 397-0227.
- Evidencia: el cambio ya estaba publicado en `fddab6c` (07/10, "fix: update and centralize Quepia contact phone", producción READY `dpl_GgiipMXkPNcPfva2woVn6PSRgfhb`), que centraliza el número en `lib/contact.ts`.
- Repo: `rg` sin rastros de `397-0227`, `3970227`, `3513970227` ni enlaces `wa.me` sin el 9; solo quedan números de ejemplo en formularios y tests, y valores de muestra en `supabase-config.sql`.
- Producción: home, `/contacto`, `/sobre-nosotros`, `/llms.txt` y las 36 URLs del sitemap revisadas sin el número anterior. El JSON-LD tiene `telephone` +5493517186433, los enlaces de WhatsApp apuntan a `wa.me/5493517186433` y la configuración pública muestra +54 9 351 718-6433.
- Cambio: ninguno en código; solo este registro.

## 2026-10-08 — Codex — metadata de Valle de Punilla

- Evidencia: `/valle-de-punilla` respondía HTTP 200 pero `og:url` apuntaba a `https://quepia.com` y Open Graph/Twitter utilizaban el título de portada. Esta ruta no estaba incluida en la corrección de metadata local anterior.
- Cambio: título, descripción y URL social específicos, coherentes con canonical; identidad Quepia, locale es_AR y texto alternativo de imagen. La descripción resume servicios ya visibles y la base real en Villa Carlos Paz.
- Archivo: `app/valle-de-punilla/page.tsx`. Se conservan las mejoras recientes de redes sociales y el contenido de las otras zonas.
- Validación: instalación con lockfile congelado, lint del archivo modificado, typecheck y build completo correctos (advertencias existentes en otros archivos/dependencias). HTML generado validado: canonical, URL social, títulos y descripciones coherentes, locale es_AR e indexación. Publicación pendiente de verificar tras integrar el commit.
- Motivo: que la página de cobertura de Punilla se identifique correctamente al compartirla, sin confundirla con la portada. No se añaden páginas ni afirmaciones comerciales nuevas.

### Verificación de publicación de Punilla

- Commit: `9517a13e78192fa271e6a17be4adcd6eb2bdc24f`.
- Vercel: `dpl_3fxAA71HoaguMyK8E8wbFrPrYtar`, producción READY con el SHA esperado y alias quepia.com.
- `/valle-de-punilla`: HTTP 200 en producción, og:url propio, títulos y descripciones coincidentes en Open Graph/Twitter, locale es_AR y robots index/follow. Canonical comprobado en el HTML del build.
- Resultado: publicado y verificado por Codex. No se midieron cambios de tráfico ni citas de asistentes.

## 2026-10-12 — Grokbot — title y description de gestión de redes con Villa Carlos Paz (SEO-29a)

- Alcance: `/servicios/gestion-de-redes-sociales` (title, H1, og:title, twitter:title, meta description, bajada visible y descripción del schema Service, que salen de la misma entrada).
- Evidencia: el title era "Gestión de redes sociales en Córdoba | Quepia", sin la ciudad base, y la description tenía 163 caracteres (por encima de 155, se corta en resultados). Ningún commit reciente de Codex (`d2d0d70` sumó FAQ en la misma entrada) había cambiado estos dos campos.
- Cambio: title "Gestión de redes sociales en Carlos Paz y Córdoba" (58 caracteres con " | Quepia"); description de 131 caracteres: "Gestión de redes sociales en Villa Carlos Paz y Córdoba: planificación, contenido, diseño y reels para tu marca. Pedí tu propuesta." Se conservan las FAQ y secciones de Codex. La URL no cambia.
- Motivo: sumar la ciudad base a la página del servicio principal y evitar el corte de la description. No garantiza mejoras de ranking.
- Archivo: `lib/seo/services.ts` (2 líneas).
- Validación: eslint del archivo, typecheck y build completo correctos con Node 22 y NODE_USE_ENV_PROXY=1, contra un mock vacío de Supabase en 127.0.0.1 (sin credenciales). HTML generado con el title y la description nuevos.
- Publicación: verificada (ver abajo).

### Verificación de publicación (Grokbot)

- Commit: `f77eeaf99a9db3d20ea821d411b53a88f7fab2c4`.
- Vercel: `dpl_5gu4iyUF7taNVC5DECeuRhJttKAd`, producción READY el 12/10 a las 14:21 ART, SHA esperado y alias quepia.com.
- `/servicios/gestion-de-redes-sociales`: HTTP 200 (con y sin cache-buster) con title, meta description, H1, og:title y twitter:title nuevos. Home y `/servicios/produccion-audiovisual`: 200 sin cambios.
- Resultado: publicado y verificado; sin revert. Esta verificación se registra en el commit siguiente de Grokbot para respetar el push único del 12/10.

## 2026-10-13 — Codex — conexiones entre redes sociales, zonas y casos

- Oportunidad: la página del servicio principal describía su cobertura en texto, pero no enlazaba en ese contexto a las páginas locales. Su schema Service no conectaba los casos públicos mostrados con el servicio.
- Cambio: sección visible con enlaces contextuales a Villa Carlos Paz y Córdoba Capital/provincia, información de coordinación ya publicada, identificador estable del Service y referencias subjectOf a las fichas de casos de redes mostradas en la misma página. Se reutiliza una sola selección de proyectos para HTML y schema.
- Alcance: enlaces y relaciones del servicio de redes; identificador estable del schema Service en las siete páginas existentes.
- Archivo: `app/servicios/[slug]/page.tsx`.
- Motivo: facilitar la navegación entre servicio, cobertura y evidencia publicada, y hacer explícitas esas relaciones para lectores de datos estructurados. No implica una mejora de ranking garantizada.
- Se conservan el title/description recientes, las FAQ, los casos y las condiciones de alcance. No se incorporan datos o métricas nuevas.
- Validación: lint, typecheck y build completo correctos (advertencias previas ajenas al cambio). HTML generado verificado: enlaces locales, diez FAQ conservadas y todas las referencias a casos del schema presentes también como enlaces y títulos visibles. Publicación pendiente de verificar tras integrar el commit.

### Verificación de publicación de enlaces y casos del servicio

- Commit de implementación: `3db356eb27d1a663f1c3cb502b6dd6fb80dabb3b`.
- Vercel: `dpl_8Z7hJv1TVGcDiiJNwcfJvapr7h3j`, producción READY, SHA esperado y alias quepia.com.
- Gestión de redes: HTTP 200, sección local publicada con enlaces a ambas zonas, Service con identificador estable y tres casos subjectOf presentes también como enlaces visibles.
- Branding: HTTP 200 y schema Service con identificador estable; se conservan su contenido y presentación.
- Resultado: publicado y verificado por Codex. Se actualizó la automatización para evaluar oportunidades autónomas de contenido/enlaces además de errores técnicos, sin depender de materiales nuevos del usuario ni inventar datos.
- No se midieron cambios de posiciones, tráfico ni recomendaciones de asistentes.

## 2026-10-13 — Grokbot — 404 real para servicios inexistentes (SEO-02)

- Alcance: rutas `/servicios/<slug>` que no corresponden a ninguno de los siete servicios de `lib/seo/services.ts`. Las siete páginas existentes no cambian.
- Evidencia: el 13/10 a las 10:40 ART, `https://quepia.com/servicios/xyz-no-existe` respondía HTTP 200 (soft 404, ya detectado en el backlog del 06/10). El `notFound()` llegaba después del streaming de `app/servicios/loading.tsx`, así que el status quedaba en 200. Ningún commit reciente de Codex tocó este comportamiento (`3db356e` cambió enlaces y schema de la misma página, que se conservan).
- Cambio: `export const dynamicParams = false;` en `app/servicios/[slug]/page.tsx`. La lista de servicios es estática (`generateStaticParams`), así que cualquier slug fuera de ella da 404 desde el router, sin pasar por el loading.
- Motivo: evitar que buscadores indexen o rastreen URLs inexistentes como páginas válidas. No garantiza mejoras de ranking.
- Archivo: `app/servicios/[slug]/page.tsx` (1 línea).
- Validación: eslint del archivo, `pnpm typecheck` y `pnpm build` correctos con Node 22, contra un mock vacío de Supabase en 127.0.0.1 (sin credenciales). Con `next start` local: `/servicios/xyz-no-existe` 404; los siete servicios y `/servicios` 200.
- Nota sin cambio: la página 404 sigue sumando el `robots` "index, follow" del layout además del `noindex`; con status 404 no tiene efecto práctico y queda fuera de este commit.
- Publicación: verificada (ver abajo).

### Verificación de publicación (Grokbot)

- Commit: `b4a0d035b2fe019f1baa9f26040593c93762d45c`.
- Vercel: `dpl_4xvmouqRC4LYo5AVhPmfZs3QK9Hw`, producción READY el 13/10 a las 10:44 ART, SHA esperado y alias quepia.com.
- Revalidado el 14/10 a las 10:25 ART (deploy vigente `c634286` / `dpl_jndtcnfGzk8xjg6fE6Wtoe3hRQs2`): `/servicios/xyz-no-existe` y `/servicios/otro-inexistente` HTTP 404; los siete servicios (`gestion-de-redes-sociales`, `produccion-audiovisual`, `fotografia-de-producto`, `branding-e-identidad`, `diseno-grafico`, `filmacion-con-dron-cordoba`, `packaging`), `/` y `/servicios` HTTP 200.
- Resultado: publicado y vigente; sin revert. Esta verificación se registra en el commit de SEO-01 para respetar el push único del 13/10.

## 2026-10-14 — Codex — navegación entre casos y rubros

- Oportunidad comprobada: la ficha de Hotel Bahía Norte (HTTP 200) enlazaba a los servicios, pero no a turismo y hotelería; las páginas de rubros ya enlazaban a sus casos. La relación era navegable en una sola dirección.
- Cambio: sección visible en fichas que pertenecen a un rubro ya definido, con enlaces hacia los servicios y casos de ese rubro. Se utiliza exactamente el criterio de asociación existente en `/rubros/[slug]`, sin asignar rubros nuevos ni cambiar las categorías de los proyectos.
- Archivo: `app/trabajos/[slug]/page.tsx`.
- Motivo: conectar evidencia publicada con el contenido de contratación y permitir descubrir otros casos relacionados. Las páginas de rubros explican la cobertura desde Villa Carlos Paz hacia Córdoba.
- Se conservan galerías, descripciones, schema, metadata y enlaces existentes. Las fichas sin asociación publicada no muestran la sección.
- Validación: lint, typecheck y build completo correctos (advertencias previas ajenas al cambio). HTML de las 16 fichas comprobado: enlaces a páginas de rubro existentes en los casos asociados, sección ausente cuando no hay asociación; ejemplos de turismo, gastronomía e inmobiliarias verificados. Publicación pendiente de verificar tras integrar el commit.

### Verificación de publicación de casos y rubros

- Commit de implementación: `ea189a6063a487c1ac4e05841aaf5e6a252ff949`.
- Vercel: `dpl_DmY2SsttJBHGkQnXyCLjpzUSrXfC`, producción READY con el SHA esperado y alias quepia.com.
- Hotel Bahía Norte, Inmobiliaria Noe García Roñoni y Mike Donas: HTTP 200, sección visible y enlace al rubro correspondiente publicados; canonical e index/follow conservados.
- Build: tres fichas con relación existente muestran la sección y trece sin relación no la muestran.
- Resultado: publicado y verificado por Codex. No se midieron cambios de posiciones, tráfico ni recomendaciones de asistentes.

## 2026-10-14 — Grokbot — no cargar video ProcessSection en mobile (SEO-01)

- Alcance: video ambient de `components/home/ProcessSection.tsx` en la home (capa nítida sobre el blur).
- Evidencia: había un `<video autoPlay muted loop playsInline preload="metadata">` crudo (mismo mp4 de 14,8 MB que el `AmbientVideo` blur) que se descargaba también en mobile. `AmbientVideo` ya evita mobile y reduced-motion, y usa poster `/images/video-poster.webp`. Ningún commit reciente de Codex tocó este archivo (`ea189a6` / `c634286` son casos↔rubros).
- Cambio: reemplazar el `<video>` crudo por un segundo `<AmbientVideo src={encodeURI(ambientVideoSrc)} className="absolute inset-0 h-full w-full object-cover opacity-[0.22] scale-[1.36]" />`. Se conserva el blur y el resto del diseño.
- Motivo: evitar la descarga del mp4 en celular y con prefers-reduced-motion; mejorar peso/LCP de la home en mobile. No garantiza mejoras de ranking.
- Archivo: `components/home/ProcessSection.tsx` (parche mínimo).
- Validación: eslint del archivo, `pnpm typecheck` y `pnpm build` correctos con Node 22 y NODE_USE_ENV_PROXY=1, contra un mock vacío de Supabase en 127.0.0.1 (sin credenciales).
- Publicación: verificada (ver abajo).

### Verificación de publicación (Grokbot)

- Commit: `19851d2564fef058cc8b8d9cbe8162689b31a815`.
- Vercel: `dpl_ET9DNUyF48hVWmnCJ8qz1z8qFGJm`, producción READY el 14/10 a las 10:29 ART, SHA esperado y alias quepia.com.
- 14/10, 10:30 ART: home HTTP 200 (con y sin cache-buster), 0 apariciones de `preload="metadata"` y de "ANIMACIONES" en el HTML; las capas de ProcessSection salen como `<video … poster="/images/video-poster.webp" preload="none">` sin `src`; texto "No solo diseñamos, construimos sistemas." presente.
- Revalidado el 15/10 a las 10:22 ART (deploy vigente `4feace0` / `dpl_EviGPRPvoTjEx7AexqoxUA6jFaBc`): mismo resultado en la home (200, sin `preload="metadata"` ni "ANIMACIONES", videos con `preload="none"` y poster).
- Resultado: publicado y vigente; sin revert. Esta verificación se registra en el commit de IA-02 para respetar el push único del 14/10. Pendiente opcional: Lighthouse mobile y recomprimir el mp4.

## 2026-10-14 — Codex — respuestas de contratación en planes

- Oportunidad comprobada: `/precios` mostraba los planes y el formulario, pero no respondía directamente cómo se cotiza, qué información enviar, si puede contratarse un servicio por separado ni cómo coordinar desde Córdoba Capital.
- Cambio: cuatro respuestas visibles y FAQPage coincidente, basadas en el alcance ya publicado en servicios y zonas; enlace contextual al servicio principal de gestión de redes.
- Archivos: `app/precios/page.tsx`, `app/precios/PreciosClient.tsx`.
- Implementación: preguntas y enlace renderizados como contenido del servidor dentro de la página existente, conservando planes, formulario y diseño. Las respuestas están en HTML sin depender de interacción ni de cargar datos nuevos.
- Motivo: cubrir consultas de contratación con información clara y enlazar los planes con tareas y casos reales del servicio principal. No se publican importes, promesas de resultados ni condiciones nuevas.
- Fuente factual: páginas actuales de servicios y cobertura local. No requiere materiales nuevos del usuario.
- Validación: lint de archivos modificados, typecheck y build completo correctos (advertencias previas ajenas al cambio). HTML generado comprobado: cuatro preguntas/respuestas idénticas al FAQPage, planes y formulario conservados, un H1, canonical y enlace al servicio correctos. Publicación pendiente de verificar tras integrar el commit.

### Verificación de publicación de respuestas de planes

- Commit de implementación: `2ea8a018bed2ed38b80a67090b7f1eae95221c81`.
- Vercel: `dpl_27FrDC83SgWms5NhjkG4xWFSkhPT`, producción READY, SHA esperado y alias quepia.com.
- `/precios`: HTTP 200, cuatro preguntas/respuestas presentes en HTML y coincidentes con FAQPage; enlace a gestión de redes, formulario y canonical conservados.
- Resultado: publicado y verificado por Codex. No se midieron cambios de posiciones, tráfico ni recomendaciones de asistentes.

## 2026-10-15 — Grokbot — punto de contacto en el schema de la organización (IA-02)

- Alcance: JSON-LD `LocalBusiness`/`ProfessionalService` (`@id` `https://quepia.com/#organization`) que sale en todas las páginas públicas desde `app/layout.tsx`. No hay cambio visible.
- Evidencia: el 15/10 a las 10:20 ART el schema de la organización tenía `telephone` y `email`, pero no `contactPoint`; solo `/contacto` declaraba un `ContactPoint`, sin teléfono. `founder` ya está cubierto: `/sobre-nosotros` lo declara sobre el mismo `@id` con los datos visibles del equipo (Lautaro López Labrin y Camila De Angelis), así que no se duplica en el layout. Ningún commit reciente de Codex tocó `app/layout.tsx` (`2ea8a01` y `4feace0` son de `/precios`).
- Cambio: `contactPoint` con `contactType` "customer service", el teléfono centralizado (`CONTACT_PHONE`, +5493517186433), el mismo email que ya usa el schema, `url` `https://quepia.com/contacto`, `areaServed` "AR" y `availableLanguage` "Spanish" (igual que `/contacto`).
- Motivo: que buscadores y asistentes encuentren en la entidad de Quepia un canal de contacto explícito y coherente con lo publicado. No garantiza mejoras de ranking ni citas.
- Archivo: `app/layout.tsx` (9 líneas agregadas).
- Validación: eslint del archivo (solo la advertencia previa de fuentes), `pnpm typecheck` y `pnpm build` correctos con Node 22 y NODE_USE_ENV_PROXY=1, contra un mock vacío de Supabase en 127.0.0.1 (sin credenciales). HTML generado de `/contacto`: `contactPoint` presente y parseable, con el número nuevo; sin rastros del número anterior.
- Publicación: verificada (ver abajo).

### Verificación de publicación (Grokbot)

- Commit: `ba053165f83b4441f9fd6fa91a5bd6081e8aa70c`.
- Vercel: `dpl_YRtyxmmu7rggzrpW9YK6sZMWnVTi`, producción READY el 15/10 a las 10:23 ART, SHA esperado; statuses "Vercel – quepia-web" y "Vercel – quepia-mcp" success.
- 15/10, 10:26 ART: `/`, `/contacto`, `/sobre-nosotros`, `/servicios`, `/servicios/gestion-de-redes-sociales`, `/precios` y `/villa-carlos-paz` HTTP 200 (home y contacto también con cache-buster), todas con el `contactPoint` nuevo; 0 rastros del número anterior. `/servicios/xyz-no-existe` 404.
- Revalidado el 16/10 a las 10:22 ART (deploy vigente `df7bfac`): home y `/contacto` HTTP 200 con `contactPoint.telephone` +5493517186433 y `contactType` "customer service".
- Resultado: publicado y vigente; sin revert. Esta verificación se registra en el commit de SEO-29b para respetar el push único del 15/10. Pendiente (usuaria): `openingHoursSpecification` solo si confirma el horario de /contacto.

## 2026-10-15 — Codex — respuestas específicas de branding

- Oportunidad: la página de branding tenía cuatro preguntas frecuentes generales compartidas con otros servicios; los alcances particulares solo se explicaban en párrafos extensos de la misma página.
- Cambio: tres preguntas/respuestas específicas sobre entregables de identidad visual, conservación o renovación del logo y alcance separado de redes, packaging y cartelería. Se conservan las cuatro preguntas anteriores.
- Archivo: `lib/seo/services.ts` (solo entrada branding-e-identidad).
- Fuente factual: secciones publicadas «Qué incluye una identidad», «Para marcas nuevas y existentes», «Entregables y uso cotidiano» e «Identidad conectada con contenidos».
- Motivo: permitir encontrar y comparar el alcance del servicio con respuestas directas, tanto en HTML como en FAQPage. No se amplían entregables incluidos ni se incorporan precios, plazos, resultados o demanda de búsquedas supuesta.
- Se conservan la prioridad y el contenido de gestión de redes, así como las mejoras locales y de contacto recientes.
- Validación: instalación con lockfile congelado, lint del archivo, typecheck y build completo correctos (advertencias previas ajenas al cambio). HTML y FAQPage comprobados: siete respuestas de branding coincidentes y diez preguntas de gestión de redes conservadas. Publicación pendiente de verificar tras integrar el commit.

### Verificación de publicación de respuestas de branding

- Commit de implementación: `b3d172530cef81c9d271c58e9e56349024a3d56a`.
- Vercel: `dpl_5yFCySgSTNb369ZgzWQTtYnsKk7J`, producción READY, SHA esperado y alias quepia.com.
- Branding: HTTP 200, siete respuestas coincidentes entre HTML y FAQPage, canonical e index/follow correctos.
- Gestión de redes: HTTP 200, sus diez respuestas conservadas y coincidentes con FAQPage; canonical e index/follow correctos.
- Resultado: publicado y verificado por Codex. No se midieron cambios de posiciones, tráfico ni recomendaciones de asistentes.

## 2026-10-16 — Grokbot — sección Community manager en gestión de redes (SEO-29b)

- Alcance: `/servicios/gestion-de-redes-sociales` (sección visible nueva) y `knowsAbout` del schema de la organización en todas las páginas públicas.
- Evidencia: el 16/10 a las 10:21 ART, la keyword "community manager" no aparecía en páginas públicas (solo "community management" en una FAQ de Codex). El backlog priorizaba SEO-29b como siguiente ítem diario. Ningún commit reciente de Codex tocó esta sección (`b3d1725` / `df7bfac` son FAQ de branding).
- Cambio: sección H2 "Community manager en Villa Carlos Paz y Córdoba" (~102 palabras) tras "Qué incluye": tareas incluidas (planificación, diseño, redacción, publicación), cobertura local (Carlos Paz, Punilla, Capital), comentarios/mensajes no incluidos por defecto (add-on opcional con automatizaciones), sin promesas de resultados. En `knowsAbout` se suma "Community manager" (previsto en IA-02 al publicar SEO-29b).
- Motivo: cubrir la intención *community manager Villa Carlos Paz / Córdoba*, hoy sin cobertura en el cuerpo. No garantiza mejoras de ranking.
- Archivos: `lib/seo/services.ts`, `app/layout.tsx`.
- Validación: eslint de los archivos (solo la advertencia previa de fuentes), `pnpm typecheck` y `pnpm build` correctos con Node 22 y NODE_USE_ENV_PROXY=1, contra un mock vacío de Supabase en 127.0.0.1 (sin credenciales). HTML generado con el H2 nuevo y `knowsAbout` con "Community manager".
- Publicación: pendiente de verificar tras el push; se agregará la verificación en el próximo commit de Grokbot.


## 2026-10-17 — Codex — dimensiones reales de imagen social

- Evidencia: la portada de producción respondía HTTP 200 y declaraba `og:image:width=1200` y `og:image:height=630`, pero el JPEG `/og-image.jpg` es 1024×537. Se comprobó que el archivo local coincide por hash con el de main.
- Cambio: declarar 1024×537 en la metadata del layout, portada, servicios, trabajos, contacto, sobre nosotros, planes y privacidad. Las páginas individuales de servicios ya tenían las medidas correctas y se conservan.
- Archivos: `app/layout.tsx`, `app/page.tsx`, `app/servicios/page.tsx`, `app/trabajos/page.tsx`, `app/contacto/page.tsx`, `app/sobre-nosotros/page.tsx`, `app/precios/page.tsx`, `app/privacidad/page.tsx`.
- Motivo: que los consumidores de Open Graph reciban información fiel del recurso publicado. No se cambia ni se reescala la imagen, ni se alteran textos, URLs, diseño o datos comerciales.
- Validación: instalación con lockfile congelado, lint de archivos modificados (advertencia previa de fuentes), typecheck y build completo correctos. HTML de siete páginas públicas y del servicio principal comprobado con el servidor de producción local (HTTP 200 en todas): URL de imagen conservada, dimensiones 1024×537 e index/follow. Publicación pendiente de verificar tras integrar el commit.

### Verificación de publicación de dimensiones de imagen

- Commit de implementación: `67db1aa04a2c040e7f1f01d0582148943e5c26bc`.
- Vercel: `dpl_45h4gj9FKS2yyrMR84TfiDs2kAXW`, producción READY, SHA esperado y alias quepia.com.
- Portada, servicios, trabajos, contacto, sobre nosotros, precios, privacidad y servicio principal: HTTP 200 en producción, `og:image` conservado y dimensiones 1024×537 correctas en todas las respuestas.
- Resultado: publicado y verificado por Codex. No se midieron cambios de posiciones, tráfico ni recomendaciones de asistentes.

## 2026-10-18 — Codex — índice y enlaces a secciones de servicios

- Evidencia: gestión de redes respondía HTTP 200 con 14 H2 y un único enlace interno de fragmento al formulario. Los apartados del servicio no tenían destinos propios para consulta directa.
- Cambio: índice accesible en las siete páginas de servicios existentes, generado desde sus títulos reales; identificadores estables derivados de cada título y margen de desplazamiento para el encabezado fijo. Se mantiene el acceso al formulario.
- Archivos: `app/servicios/[slug]/page.tsx`, `components/seo/PublicContent.tsx`.
- Motivo: facilitar la consulta de alcance, proceso y cobertura, y permitir enlaces directos a esos apartados. No se reescribe contenido, no se añaden servicios ni se alteran canonical, schema o condiciones comerciales.
- Implementación sin JavaScript adicional de navegación: enlaces HTML de fragmento y secciones del servidor. El componente compartido admite un id opcional; sus otros usos conservan su contenido.
- Validación: lint, typecheck y build completo correctos (advertencias previas ajenas al cambio). HTML de siete servicios comprobado: 57 enlaces a apartados, cada uno con un destino único; un H1 y el destino del formulario conservados en cada página. Publicación pendiente de verificar tras integrar el commit.
