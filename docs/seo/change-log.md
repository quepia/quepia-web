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
