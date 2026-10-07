# Registro de mejoras SEO

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
