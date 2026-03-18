#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"
import vm from "node:vm"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

const CATEGORY_VALUES = new Set([
  "branding",
  "diseno-grafico",
  "fotografia",
  "video",
  "redes-sociales",
  "packaging",
  "carteleria",
  "marketing",
  "productos",
])

const KEY_ALIASES = {
  "03_Mike_Donas": "03_Mike_Donas_Foto_Producto",
  "05_Modelo_AILE_2023": "05_Modelo_Historico_AILE_2023",
  "06_Pablo_Cornet": "06_Asuncion_Pablo_Cornet",
  "09_Logo_CEL": "09_Logo_Identidad_CEL",
}

const OVERRIDES = {
  "01_Onix_Retrato_Productos": {
    title: "Onix - Retrato y Productos",
    category: "fotografia",
    description: "Fotografia de retrato y producto para Onix.",
    destacado: true,
  },
  "02_Fotografia_Inmobiliaria": {
    title: "Fotografia Inmobiliaria",
    category: "fotografia",
    description: "Serie fotografica para propiedades y espacios inmobiliarios.",
    destacado: true,
  },
  "03_Mike_Donas_Foto_Producto": {
    title: "Mike Donas - Foto Producto",
    category: "fotografia",
    description: "Fotografia de producto para marca gastronómica Mike Donas.",
  },
  "04_Fotografia_Arquitectonica": {
    title: "Fotografia Arquitectonica",
    category: "fotografia",
    description: "Fotografia de arquitectura e interiores.",
  },
  "05_Modelo_Historico_AILE_2023": {
    title: "Modelo Historico AILE 2023",
    category: "diseno-grafico",
    description: "Desarrollo visual historico para AILE (2023).",
  },
  "06_Asuncion_Pablo_Cornet": {
    title: "Asuncion Pablo Cornet",
    category: "fotografia",
    description: "Produccion fotografica para Asuncion Pablo Cornet.",
  },
  "07_Logo_INDAR": {
    title: "Logo INDAR - Ropa de Trabajo",
    category: "branding",
    description: "Diseño de logotipo e identidad para INDAR.",
    destacado: true,
  },
  "08_Logo_Dalton": {
    title: "Logo Dalton - Indumentaria",
    category: "branding",
    description: "Diseño de logotipo para Dalton Indumentaria.",
  },
  "09_Logo_Identidad_CEL": {
    title: "Logo e Identidad CEL",
    category: "branding",
    description: "Sistema de identidad visual para CEL.",
  },
  "10_Hotel_Bahia_Norte": {
    title: "Hotel Bahia Norte - Social Media",
    category: "redes-sociales",
    description: "Diseño de piezas para comunicacion en redes sociales.",
    destacado: true,
  },
  "11_Rediseno_AILE": {
    title: "Rediseño AILE - Asociacion",
    category: "branding",
    description: "Rediseño de identidad visual para la asociacion AILE.",
  },
  "12_Jovenes_PRO": {
    title: "Identidad Visual Jovenes PRO",
    category: "branding",
    description: "Identidad visual para Jovenes PRO.",
  },
  "13_Jubilados_Pensionados": {
    title: "Logo Asociacion Jubilados",
    category: "branding",
    description: "Diseño de identidad para asociacion de jubilados y pensionados.",
  },
  "14_Aristos": {
    title: "Aristos - Logo y Carpetas",
    category: "branding",
    description: "Desarrollo de logotipo y sistema de carpetas institucionales.",
  },
}

const TITLE_PREFIX_PATTERN = /^Lautaro Lopez Labrin Quepia\s+/i

const TITLE_OVERRIDES_BY_SLUG = {
  "onix-retrato-y-productos": {
    title: "Onix - Retrato y Productos",
    category: "fotografia",
    description:
      "Produccion fotografica de retrato y producto para Onix, enfocada en textura, iluminacion controlada y piezas listas para catalogo y redes sociales.",
    destacado: true,
  },
  "fotografia-inmobiliaria": {
    title: "Fotografia Inmobiliaria",
    category: "fotografia",
    description:
      "Cobertura fotografica de propiedades residenciales y comerciales orientada a venta y alquiler, priorizando amplitud, luz natural y lectura espacial.",
    destacado: true,
  },
  "mike-donas-foto-producto": {
    title: "Mike Donas - Foto de Producto",
    category: "fotografia",
    description:
      "Sesion de fotografia de producto para Mike Donas con direccion de arte gastronomica y versiones optimizadas para e-commerce, piezas promocionales y redes.",
  },
  "fotografia-arquitectonica": {
    title: "Fotografia Arquitectonica",
    category: "fotografia",
    description:
      "Registro fotografico arquitectonico de exteriores e interiores con composicion limpia, control de lineas y correccion de perspectiva para comunicacion profesional.",
  },
  "modelo-historico-aile-2023": {
    title: "Modelo Historico AILE 2023",
    category: "diseno-grafico",
    description:
      "Desarrollo grafico del modelo historico AILE 2023 para comunicar evolucion institucional en presentaciones, documentos editoriales y difusion digital.",
  },
  "asuncion-pablo-cornet-intendente-villa-allende": {
    title: "Asuncion - Pablo Cornet",
    category: "fotografia",
    description:
      "Serie fotografica documental realizada en Asuncion para Pablo Cornet, combinando retrato contextual, arquitectura urbana y narrativa visual de territorio.",
  },
  "logo-indar-ropa-de-trabajo": {
    title: "Logo INDAR - Ropa de Trabajo",
    category: "branding",
    description:
      "Diseno de logotipo e identidad base para INDAR, marca de ropa de trabajo, con sistema de aplicaciones para indumentaria, etiquetas y piezas corporativas.",
  },
  "logo-dalton-indumentaria": {
    title: "Logo Dalton - Indumentaria",
    category: "branding",
    description:
      "Creacion de identidad visual para Dalton Indumentaria, definiendo estructura tipografica, variantes de marca y reglas de uso para soportes fisicos y digitales.",
  },
  "diseno-de-logo-e-identidad-visual-cel": {
    title: "Logo e Identidad CEL",
    category: "branding",
    description:
      "Sistema de identidad visual para CEL: construccion de logo, paleta cromatica, lineamientos de marca y piezas institucionales de uso cotidiano.",
  },
  "fotografia-y-redes-hotel-bahia-norte": {
    title: "Hotel Bahia Norte - Social Media",
    category: "redes-sociales",
    description:
      "Produccion de piezas y linea visual para redes de Hotel Bahia Norte, integrando contenido fotografico, diseno grafico y mensajes promocionales de temporada.",
    destacado: true,
  },
  "rediseno-aile-asociacion": {
    title: "Rediseño AILE - Asociacion",
    category: "branding",
    description:
      "Proyecto de rediseño de identidad para AILE, actualizando lenguaje visual, jerarquia de marca y coherencia entre comunicacion institucional y digital.",
  },
  "identidad-visual-jovenes-pro": {
    title: "Identidad Visual Jovenes PRO",
    category: "branding",
    description:
      "Desarrollo de identidad visual para Jovenes PRO con piezas de campana, criterios de uso en redes y material de comunicacion territorial.",
  },
  "diseno-de-logo-as-de-jubilados-y-pensionados": {
    title: "Logo Asociacion de Jubilados y Pensionados",
    category: "branding",
    description:
      "Diseno de logotipo institucional para asociacion de jubilados y pensionados, priorizando legibilidad, cercania visual y aplicacion versatil.",
  },
  "vectorizacion-de-logo-y-diseno-de-carpetas-aristos": {
    title: "Aristos - Logo y Carpetas Institucionales",
    category: "branding",
    description:
      "Vectorizacion de logotipo y diseno de carpetas institucionales para Aristos, preparado para impresion profesional y presentaciones comerciales.",
  },
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"])
const DEFAULT_MAX_GALLERY_IMAGES = 15
const DEFAULT_PORTFOLIO_DIR =
  "/Users/lautylopez/Desktop/QUEPIA/PAGINA WEB V2/PORTFOLIO WEB/Portfolio_Quepia"

function printUsage() {
  console.log(`
Portfolio Import Utility

Usage:
  node scripts/portfolio-import.mjs [options]

Options:
  --portfolio-dir <path>       Root folder with portfolio project folders
  --descargador <path>         Path to Descargador_Portfolio.html
  --catalog-json <path>        Output JSON catalog path (default: data/portfolio-catalog.generated.json)
  --catalog-csv <path>         Output CSV catalog path (default: data/portfolio-catalog.generated.csv)
  --input-json <path>          Import from an existing catalog JSON instead of scanning sources
  --execute                    Upload project galleries and write rows to Supabase table "proyectos"
  --overwrite                  Update existing rows by title instead of skipping them
  --max-gallery-images <num>   Limit gallery images per project (default: 15)
  --keep-remote-urls           Keep remote image URLs instead of downloading + uploading to Supabase
  --prune-missing              Delete DB rows in "proyectos" that are not present in the catalog input
  --no-myportfolio             Skip parsing MyPortfolio downloader HTML
  --behance-user <user|url>    Include Behance projects from username/profile URL
  --behance-limit <number>     Max Behance projects to fetch (default: 24)
  --help                       Show this help
`.trim())
}

function parseArgs(argv) {
  const defaults = {
    portfolioDir: DEFAULT_PORTFOLIO_DIR,
    downloaderHtmlPath: null,
    catalogJsonPath: path.join("data", "portfolio-catalog.generated.json"),
    catalogCsvPath: path.join("data", "portfolio-catalog.generated.csv"),
    inputJsonPath: null,
    execute: false,
    overwrite: false,
    maxGalleryImages: DEFAULT_MAX_GALLERY_IMAGES,
    keepRemoteUrls: false,
    pruneMissing: false,
    noMyPortfolio: false,
    behanceUser: null,
    behanceLimit: 24,
  }

  const args = [...argv]
  while (args.length > 0) {
    const token = args.shift()
    if (!token) break
    switch (token) {
      case "--portfolio-dir":
        defaults.portfolioDir = mustReadFlagValue(args, token)
        break
      case "--descargador":
        defaults.downloaderHtmlPath = mustReadFlagValue(args, token)
        break
      case "--catalog-json":
        defaults.catalogJsonPath = mustReadFlagValue(args, token)
        break
      case "--catalog-csv":
        defaults.catalogCsvPath = mustReadFlagValue(args, token)
        break
      case "--input-json":
        defaults.inputJsonPath = mustReadFlagValue(args, token)
        break
      case "--behance-user":
        defaults.behanceUser = normalizeBehanceUser(mustReadFlagValue(args, token))
        break
      case "--behance-limit": {
        const raw = mustReadFlagValue(args, token)
        const parsed = Number.parseInt(raw, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid value for ${token}: ${raw}`)
        }
        defaults.behanceLimit = parsed
        break
      }
      case "--execute":
        defaults.execute = true
        break
      case "--overwrite":
        defaults.overwrite = true
        break
      case "--max-gallery-images": {
        const raw = mustReadFlagValue(args, token)
        const parsed = Number.parseInt(raw, 10)
        if (!Number.isFinite(parsed) || parsed <= 0) {
          throw new Error(`Invalid value for ${token}: ${raw}`)
        }
        defaults.maxGalleryImages = parsed
        break
      }
      case "--keep-remote-urls":
        defaults.keepRemoteUrls = true
        break
      case "--prune-missing":
        defaults.pruneMissing = true
        break
      case "--no-myportfolio":
        defaults.noMyPortfolio = true
        break
      case "--help":
      case "-h":
        printUsage()
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  if (!defaults.downloaderHtmlPath && !defaults.noMyPortfolio) {
    defaults.downloaderHtmlPath = path.join(defaults.portfolioDir, "Descargador_Portfolio.html")
  }

  return defaults
}

function mustReadFlagValue(args, flagName) {
  const value = args.shift()
  if (!value) {
    throw new Error(`Missing value for ${flagName}`)
  }
  return value
}

function normalizeBehanceUser(value) {
  const trimmed = value.trim()
  const fromUrl = trimmed.match(/behance\.net\/([^/?#]+)/i)
  if (fromUrl?.[1]) {
    return fromUrl[1]
  }
  return trimmed.replace(/^@/, "")
}

function parseOrder(value) {
  const match = value.match(/^(\d{1,3})[_\s-]/)
  if (!match) return 999
  return Number.parseInt(match[1], 10)
}

function normalizeKey(rawKey) {
  const trimmed = rawKey.trim()
  return KEY_ALIASES[trimmed] ?? trimmed
}

function normalizeImportedTitle(rawTitle) {
  return String(rawTitle || "").replace(TITLE_PREFIX_PATTERN, "").replace(/\s+/g, " ").trim()
}

function inferCategoryFromText(input) {
  const text = input.toLowerCase()
  if (text.includes("logo") || text.includes("identidad") || text.includes("branding")) return "branding"
  if (text.includes("fotografia") || text.includes("retrato") || text.includes("arquitect")) return "fotografia"
  if (text.includes("video") || text.includes("reel")) return "video"
  if (text.includes("social") || text.includes("redes")) return "redes-sociales"
  if (text.includes("packaging") || text.includes("envase")) return "packaging"
  if (text.includes("cartel")) return "carteleria"
  if (text.includes("marketing")) return "marketing"
  if (text.includes("producto")) return "productos"
  return "diseno-grafico"
}

function inferTitleFromKey(input) {
  const cleaned = input
    .replace(/^(\d+)[_\s-]+/, "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
  if (!cleaned) return input
  return cleaned
    .split(" ")
    .map((word) => {
      if (word.length <= 3 && word.toUpperCase() === word) return word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(" ")
}

function ensureUniqueArray(values) {
  return [...new Set(values.filter(Boolean))]
}

function pickDistributedImages(images, maxImages) {
  const unique = ensureUniqueArray(images)
  if (unique.length <= maxImages) return unique
  if (maxImages <= 1) return [unique[Math.floor(unique.length / 2)]]

  const selectedIndices = []
  const used = new Set()
  const bucketSize = unique.length / maxImages
  const bucketOffsets = [0.35, 0.65, 0.5, 0.2, 0.8]

  // Spread picks across the full sequence and vary position inside each bucket
  // to avoid selecting repetitive opening frames.
  for (let bucket = 0; bucket < maxImages; bucket += 1) {
    const start = Math.floor(bucket * bucketSize)
    const rawEnd = Math.floor((bucket + 1) * bucketSize) - 1
    const end = Math.max(start, Math.min(rawEnd, unique.length - 1))
    const offset = bucketOffsets[bucket % bucketOffsets.length]
    let candidate = start + Math.round((end - start) * offset)

    if (used.has(candidate)) {
      for (let distance = 1; distance < unique.length; distance += 1) {
        const left = candidate - distance
        const right = candidate + distance
        if (left >= start && left <= end && !used.has(left)) {
          candidate = left
          break
        }
        if (right >= start && right <= end && !used.has(right)) {
          candidate = right
          break
        }
      }
    }

    if (used.has(candidate)) {
      for (let index = 0; index < unique.length; index += 1) {
        if (!used.has(index)) {
          candidate = index
          break
        }
      }
    }

    selectedIndices.push(candidate)
    used.add(candidate)
  }

  return selectedIndices.map((index) => unique[index])
}

function isImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}

function sanitizeDescription(text, fallback) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (!normalized) return fallback
  if (normalized.length <= 220) return normalized
  return `${normalized.slice(0, 217)}...`
}

function htmlUnescape(input) {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

async function parseDownloaderHtml(filePath) {
  const html = await fs.readFile(filePath, "utf8")
  const match = html.match(/const\s+projects\s*=\s*({[\s\S]*?})\s*;\s*let\s+downloaded/s)
  if (!match?.[1]) {
    throw new Error(`Could not parse projects object in ${filePath}`)
  }
  const objectLiteral = match[1]
  const parsed = vm.runInNewContext(`(${objectLiteral})`)
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid projects object in ${filePath}`)
  }
  return parsed
}

async function scanLocalPortfolioFolder(portfolioDir) {
  const dirEntries = await fs.readdir(portfolioDir, { withFileTypes: true })
  const folders = dirEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

  const entries = []
  for (const folderName of folders) {
    const absDir = path.join(portfolioDir, folderName)
    const files = await fs.readdir(absDir, { withFileTypes: true })
    const localImages = files
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(absDir, entry.name))
      .filter(isImageFile)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))

    if (localImages.length === 0) continue

    const key = normalizeKey(folderName)
    const override = OVERRIDES[key]
    const title = override?.title ?? inferTitleFromKey(folderName)
    const category = override?.category ?? inferCategoryFromText(folderName)
    const description = override?.description ?? `Proyecto importado desde carpeta local (${folderName}).`

    entries.push({
      key,
      title,
      category,
      description,
      destacado: Boolean(override?.destacado),
      orden: parseOrder(key),
      sourceTags: ["local"],
      sourceUrl: override?.sourceUrl ?? null,
      localDir: absDir,
      localImages,
      remoteImages: [],
      cover: {
        type: "local",
        value: localImages[0] ?? null,
      },
    })
  }
  return entries
}

function mergeEntry(base, incoming) {
  const merged = {
    ...base,
    ...incoming,
  }
  if (!incoming.localDir && base.localDir) {
    merged.localDir = base.localDir
  }
  if (!incoming.sourceUrl && base.sourceUrl) {
    merged.sourceUrl = base.sourceUrl
  }
  merged.localImages = ensureUniqueArray([...(base.localImages || []), ...(incoming.localImages || [])])
  merged.remoteImages = ensureUniqueArray([...(base.remoteImages || []), ...(incoming.remoteImages || [])])
  merged.sourceTags = ensureUniqueArray([...(base.sourceTags || []), ...(incoming.sourceTags || [])])
  if (merged.localImages.length > 0) {
    merged.cover = {
      type: "local",
      value: merged.localImages[0],
    }
  } else if (merged.remoteImages.length > 0) {
    merged.cover = {
      type: "remote",
      value: merged.remoteImages[0],
    }
  } else {
    merged.cover = { type: "none", value: null }
  }
  return merged
}

function maybeApplyOverride(entry) {
  const override = OVERRIDES[entry.key]
  if (override) {
    return {
      ...entry,
      title: override.title,
      category: override.category,
      description: sanitizeDescription(override.description, entry.description),
      destacado: override.destacado ?? entry.destacado,
      sourceUrl: override.sourceUrl ?? entry.sourceUrl,
    }
  }

  const normalizedTitle = normalizeImportedTitle(entry.title)
  const normalizedSlug = slugifyTitle(normalizedTitle || entry.title)
  const titleOverride = TITLE_OVERRIDES_BY_SLUG[normalizedSlug]

  const normalizedEntry =
    normalizedTitle && normalizedTitle !== entry.title
      ? {
          ...entry,
          title: normalizedTitle,
        }
      : entry

  if (!titleOverride) {
    return normalizedEntry
  }

  return {
    ...normalizedEntry,
    title: titleOverride.title ?? normalizedEntry.title,
    category: titleOverride.category ?? normalizedEntry.category,
    description: sanitizeDescription(titleOverride.description, normalizedEntry.description),
    destacado: titleOverride.destacado ?? normalizedEntry.destacado,
    sourceUrl: titleOverride.sourceUrl ?? normalizedEntry.sourceUrl,
  }
}

async function mergeMyPortfolioData(entriesByKey, downloaderHtmlPath) {
  const projects = await parseDownloaderHtml(downloaderHtmlPath)
  for (const [rawKey, project] of Object.entries(projects)) {
    const key = normalizeKey(rawKey)
    const title = project.title?.trim() || inferTitleFromKey(key)
    const remoteImages = ensureUniqueArray((project.images || []).map((url) => url.trim()))
    const incoming = {
      key,
      title,
      category: inferCategoryFromText(`${key} ${title}`),
      description: `Proyecto importado desde MyPortfolio (${key}).`,
      destacado: false,
      orden: parseOrder(key),
      sourceTags: ["myportfolio"],
      sourceUrl: "https://lautarolopezlabrin.myportfolio.com",
      localDir: null,
      localImages: [],
      remoteImages,
      cover: {
        type: remoteImages.length > 0 ? "remote" : "none",
        value: remoteImages[0] ?? null,
      },
    }

    const existing = entriesByKey.get(key)
    const merged = maybeApplyOverride(existing ? mergeEntry(existing, incoming) : maybeApplyOverride(incoming))
    entriesByKey.set(key, merged)
  }
}

function extractMetaTag(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i"
    ),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return htmlUnescape(match[1])
    }
  }
  return null
}

async function fetchBehanceProjects(username, limit) {
  const profileUrl = `https://www.behance.net/${username}`
  const profileResponse = await fetch(profileUrl, {
    headers: {
      "user-agent": "Mozilla/5.0 (portfolio-import-script)",
      accept: "text/html,application/xhtml+xml",
    },
  })

  if (!profileResponse.ok) {
    throw new Error(`Behance profile request failed (${profileResponse.status})`)
  }
  const profileHtml = await profileResponse.text()
  const linkPattern = /href=["'](https?:\/\/www\.behance\.net\/gallery\/\d+\/[^"'/?#]+|\/gallery\/\d+\/[^"'/?#]+)["']/gi
  const urls = []
  for (const match of profileHtml.matchAll(linkPattern)) {
    const raw = match[1]
    const absolute = raw.startsWith("http") ? raw : `https://www.behance.net${raw}`
    urls.push(absolute)
  }
  const uniqueUrls = ensureUniqueArray(urls).slice(0, limit)

  const entries = []
  for (const [index, url] of uniqueUrls.entries()) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (portfolio-import-script)",
          accept: "text/html,application/xhtml+xml",
        },
      })
      if (!response.ok) {
        console.warn(`[behance] skip ${url} -> status ${response.status}`)
        continue
      }
      const html = await response.text()
      const title = extractMetaTag(html, "og:title") ?? `Behance Project ${index + 1}`
      const image = extractMetaTag(html, "og:image")
      const description =
        extractMetaTag(html, "og:description") ??
        `Proyecto importado desde Behance: ${url}`
      const slug = slugifyTitle(title)
      const key = `B${String(index + 1).padStart(2, "0")}_${slug || "behance-project"}`
      const category = inferCategoryFromText(`${title} ${description}`)

      entries.push(
        maybeApplyOverride({
          key,
          title: sanitizeDescription(title, `Behance Project ${index + 1}`),
          category,
          description: sanitizeDescription(description, `Proyecto importado desde Behance: ${url}`),
          destacado: false,
          orden: 1000 + index + 1,
          sourceTags: ["behance"],
          sourceUrl: url,
          localDir: null,
          localImages: [],
          remoteImages: image ? [image] : [],
          cover: {
            type: image ? "remote" : "none",
            value: image ?? null,
          },
        })
      )
    } catch (error) {
      console.warn(`[behance] skip ${url} -> ${error.message}`)
    }
  }

  return entries
}

function slugifyTitle(input) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80)
}

function normalizeCatalogEntries(entries) {
  const sorted = [...entries].sort((a, b) => {
    const orderDiff = a.orden - b.orden
    if (orderDiff !== 0) return orderDiff
    return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" })
  })

  const featuredByCategory = new Set()
  for (const entry of sorted) {
    if (entry.destacado) {
      featuredByCategory.add(entry.category)
    }
  }
  for (const entry of sorted) {
    if (!featuredByCategory.has(entry.category)) {
      entry.destacado = true
      featuredByCategory.add(entry.category)
    }
  }

  for (const entry of sorted) {
    if (!CATEGORY_VALUES.has(entry.category)) {
      entry.category = "diseno-grafico"
    }
    if (!entry.description || entry.description.trim().length === 0) {
      entry.description = `Proyecto importado (${entry.key}).`
    }
    entry.description = sanitizeDescription(entry.description, `Proyecto importado (${entry.key}).`)
    entry.title = sanitizeDescription(entry.title, entry.key)
    entry.sourceTags = ensureUniqueArray(entry.sourceTags)
    entry.localImages = ensureUniqueArray(entry.localImages)
    entry.remoteImages = ensureUniqueArray(entry.remoteImages)

    if (entry.localImages.length > 0) {
      entry.cover = { type: "local", value: entry.localImages[0] }
    } else if (entry.remoteImages.length > 0) {
      entry.cover = { type: "remote", value: entry.remoteImages[0] }
    } else {
      entry.cover = { type: "none", value: null }
    }
  }

  return sorted
}

async function writeCatalogFiles(entries, jsonPath, csvPath, portfolioDir) {
  await fs.mkdir(path.dirname(jsonPath), { recursive: true })
  await fs.mkdir(path.dirname(csvPath), { recursive: true })

  const catalogFile = {
    generatedAt: new Date().toISOString(),
    portfolioDir,
    entries,
  }
  await fs.writeFile(jsonPath, JSON.stringify(catalogFile, null, 2), "utf8")

  const header = [
    "key",
    "title",
    "category",
    "orden",
    "destacado",
    "sourceTags",
    "sourceUrl",
    "localDir",
    "localCount",
    "remoteCount",
    "coverType",
    "coverValue",
    "description",
  ]

  const rows = entries.map((entry) =>
    [
      entry.key,
      entry.title,
      entry.category,
      String(entry.orden),
      entry.destacado ? "true" : "false",
      entry.sourceTags.join("|"),
      entry.sourceUrl ?? "",
      entry.localDir ?? "",
      String(entry.localImages.length),
      String(entry.remoteImages.length),
      entry.cover.type,
      entry.cover.value ?? "",
      entry.description,
    ]
      .map(csvEscape)
      .join(",")
  )

  await fs.writeFile(csvPath, `${header.join(",")}\n${rows.join("\n")}\n`, "utf8")
}

function csvEscape(value) {
  if (/["\n,]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`
  }
  return value
}

function guessContentType(filePathOrUrl) {
  const ext = path.extname(filePathOrUrl).toLowerCase()
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".png":
      return "image/png"
    case ".webp":
      return "image/webp"
    case ".avif":
      return "image/avif"
    default:
      return "application/octet-stream"
  }
}

async function uploadCoverFromLocal(supabase, filePath, slug) {
  const buffer = await fs.readFile(filePath)
  const ext = path.extname(filePath).toLowerCase() || ".jpg"
  const storagePath = `proyectos/${Date.now()}-${slug}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const { error } = await supabase.storage
    .from("project-images")
    .upload(storagePath, buffer, {
      contentType: guessContentType(filePath),
      upsert: false,
      cacheControl: "3600",
    })
  if (error) {
    throw new Error(`Storage upload failed for local file ${filePath}: ${error.message}`)
  }
  const { data } = supabase.storage.from("project-images").getPublicUrl(storagePath)
  return data.publicUrl
}

async function uploadCoverFromRemote(supabase, url, slug) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (portfolio-import-script)",
      accept: "image/*,*/*;q=0.8",
    },
  })
  if (!response.ok) {
    throw new Error(`Remote image download failed (${response.status}) for ${url}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const urlObj = new URL(url)
  const extFromPath = path.extname(urlObj.pathname).toLowerCase()
  const ext = IMAGE_EXTENSIONS.has(extFromPath) ? extFromPath : ".jpg"
  const storagePath = `proyectos/${Date.now()}-${slug}-${Math.random().toString(36).slice(2, 8)}${ext}`
  const { error } = await supabase.storage
    .from("project-images")
    .upload(storagePath, buffer, {
      contentType: guessContentType(urlObj.pathname),
      upsert: false,
      cacheControl: "3600",
    })
  if (error) {
    throw new Error(`Storage upload failed for remote URL ${url}: ${error.message}`)
  }
  const { data } = supabase.storage.from("project-images").getPublicUrl(storagePath)
  return data.publicUrl
}

function resolveSourceImages(entry, maxGalleryImages) {
  const localImages = pickDistributedImages(entry.localImages || [], maxGalleryImages)
  if (localImages.length > 0) {
    return localImages.map((value) => ({ type: "local", value }))
  }

  const remoteImages = pickDistributedImages(entry.remoteImages || [], maxGalleryImages)
  if (remoteImages.length > 0) {
    return remoteImages.map((value) => ({ type: "remote", value }))
  }

  if (entry.cover?.type === "local" && entry.cover.value) {
    return [{ type: "local", value: entry.cover.value }]
  }

  if (entry.cover?.type === "remote" && entry.cover.value) {
    return [{ type: "remote", value: entry.cover.value }]
  }

  return []
}

async function upsertProject(supabase, entry, overwrite, keepRemoteUrls, maxGalleryImages) {
  const { data: existing, error: findError } = await supabase
    .from("proyectos")
    .select("id, titulo, imagen_url, galeria_urls")
    .eq("titulo", entry.title)
    .limit(1)
    .maybeSingle()

  if (findError) {
    return { status: "failed", title: entry.title, reason: `find failed: ${findError.message}` }
  }

  if (existing && !overwrite) {
    return { status: "skipped", title: entry.title, reason: "already exists and overwrite=false" }
  }

  const galleryUrls = []
  const slug = slugifyTitle(entry.title) || slugifyTitle(entry.key) || "portfolio-project"
  const sourceImages = resolveSourceImages(entry, maxGalleryImages)

  for (const [index, source] of sourceImages.entries()) {
    const imageSlug = `${slug}-${String(index + 1).padStart(2, "0")}`
    try {
      if (source.type === "local") {
        galleryUrls.push(await uploadCoverFromLocal(supabase, source.value, imageSlug))
      } else if (source.type === "remote") {
        if (keepRemoteUrls) {
          galleryUrls.push(source.value)
        } else {
          galleryUrls.push(await uploadCoverFromRemote(supabase, source.value, imageSlug))
        }
      }
    } catch (error) {
      console.warn(`[import] image skipped (${entry.title}): ${error.message}`)
    }
  }

  if (galleryUrls.length === 0 && existing) {
    const existingGallery = ensureUniqueArray([...(existing.galeria_urls || []), existing.imagen_url])
    galleryUrls.push(...pickDistributedImages(existingGallery, maxGalleryImages))
  }

  if (galleryUrls.length === 0 && sourceImages.length > 0) {
    return { status: "failed", title: entry.title, reason: "all image uploads failed" }
  }

  const limitedGalleryUrls = galleryUrls.slice(0, maxGalleryImages)

  const payload = {
    titulo: entry.title,
    descripcion: entry.description,
    categoria: entry.category,
    categorias: [entry.category],
    imagen_url: limitedGalleryUrls[0] ?? null,
    galeria_urls: limitedGalleryUrls,
    destacado: entry.destacado,
    orden: entry.orden,
  }

  if (existing) {
    const { error } = await supabase
      .from("proyectos")
      .update(payload)
      .eq("id", existing.id)
    if (error) {
      return { status: "failed", title: entry.title, reason: `update failed: ${error.message}` }
    }
    return { status: "updated", title: entry.title }
  }

  const { error } = await supabase.from("proyectos").insert(payload)
  if (error) {
    return { status: "failed", title: entry.title, reason: `insert failed: ${error.message}` }
  }
  return { status: "inserted", title: entry.title }
}

function summarizeCatalog(entries) {
  const localBacked = entries.filter((entry) => entry.localImages.length > 0).length
  const remoteOnly = entries.filter((entry) => entry.localImages.length === 0 && entry.remoteImages.length > 0).length
  const withoutCover = entries.filter((entry) => entry.cover.type === "none").length
  const byCategory = new Map()
  for (const entry of entries) {
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + 1)
  }

  console.log("Catalog summary")
  console.log(`- Total entries: ${entries.length}`)
  console.log(`- Local-backed entries: ${localBacked}`)
  console.log(`- Remote-only entries: ${remoteOnly}`)
  console.log(`- Entries without cover: ${withoutCover}`)
  console.log("- Category counts:")
  for (const [category, count] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  - ${category}: ${count}`)
  }
}

async function loadCatalogFromJson(inputJsonPath) {
  const raw = await fs.readFile(inputJsonPath, "utf8")
  const parsed = JSON.parse(raw)
  const list = Array.isArray(parsed.entries) ? parsed.entries : []
  const entries = list.map((entry, index) => {
    const key = typeof entry.key === "string" && entry.key.trim() ? entry.key : `import_${index + 1}`
    const title = typeof entry.title === "string" && entry.title.trim() ? entry.title : inferTitleFromKey(key)
    const category =
      typeof entry.category === "string" && CATEGORY_VALUES.has(entry.category)
        ? entry.category
        : inferCategoryFromText(`${key} ${title}`)
    const localImages = Array.isArray(entry.localImages) ? entry.localImages.filter((value) => typeof value === "string") : []
    const remoteImages = Array.isArray(entry.remoteImages) ? entry.remoteImages.filter((value) => typeof value === "string") : []
    const cover = entry.cover && typeof entry.cover === "object" ? entry.cover : null
    const coverType = cover && (cover.type === "local" || cover.type === "remote" || cover.type === "none") ? cover.type : "none"
    const coverValue =
      cover && typeof cover.value === "string" && cover.value.trim().length > 0 ? cover.value : null

    return {
      key,
      title,
      category,
      description:
        typeof entry.description === "string" && entry.description.trim().length > 0
          ? entry.description
          : `Proyecto importado (${key}).`,
      destacado: Boolean(entry.destacado),
      orden: Number.isFinite(Number(entry.orden)) ? Number(entry.orden) : parseOrder(key),
      sourceTags: Array.isArray(entry.sourceTags)
        ? entry.sourceTags.filter((value) => typeof value === "string" && value.length > 0)
        : [],
      sourceUrl: typeof entry.sourceUrl === "string" ? entry.sourceUrl : null,
      localDir: typeof entry.localDir === "string" ? entry.localDir : null,
      localImages,
      remoteImages,
      cover: {
        type: coverType,
        value: coverValue,
      },
    }
  })

  return normalizeCatalogEntries(entries)
}

async function buildCatalogFromSources(args) {
  const entriesByKey = new Map()

  try {
    const localEntries = await scanLocalPortfolioFolder(args.portfolioDir)
    for (const entry of localEntries) {
      entriesByKey.set(entry.key, maybeApplyOverride(entry))
    }
    console.log(`[catalog] local folders processed: ${localEntries.length}`)
  } catch (error) {
    console.warn(`[catalog] local scan skipped: ${error.message}`)
  }

  if (!args.noMyPortfolio && args.downloaderHtmlPath) {
    try {
      await mergeMyPortfolioData(entriesByKey, args.downloaderHtmlPath)
      console.log("[catalog] MyPortfolio downloader merged")
    } catch (error) {
      console.warn(`[catalog] MyPortfolio merge skipped: ${error.message}`)
    }
  }

  if (args.behanceUser) {
    try {
      const behanceEntries = await fetchBehanceProjects(args.behanceUser, args.behanceLimit)
      const existingTitles = new Set(
        [...entriesByKey.values()].map((entry) => entry.title.toLowerCase().trim())
      )
      let inserted = 0
      for (const entry of behanceEntries) {
        const titleKey = entry.title.toLowerCase().trim()
        if (existingTitles.has(titleKey)) {
          continue
        }
        existingTitles.add(titleKey)
        entriesByKey.set(entry.key, entry)
        inserted += 1
      }
      console.log(`[catalog] Behance merged: ${inserted} new project(s)`)
    } catch (error) {
      console.warn(`[catalog] Behance merge skipped: ${error.message}`)
    }
  }

  return normalizeCatalogEntries([...entriesByKey.values()])
}

function createSupabaseAdminClient() {
  dotenv.config({ path: ".env.local" })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceRoleKey || anonKey

  if (!supabaseUrl || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in .env.local")
  }
  if (!serviceRoleKey) {
    console.warn("[import] SUPABASE_SERVICE_ROLE_KEY missing; falling back to anon key (RLS may block writes).")
  }
  return createClient(supabaseUrl, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

async function pruneMissingProjects(supabase, allowedTitles) {
  const allow = new Set(allowedTitles.map((title) => title.toLowerCase().trim()))
  const { data, error } = await supabase.from("proyectos").select("id, titulo")
  if (error) {
    throw new Error(`prune lookup failed: ${error.message}`)
  }

  const rows = data || []
  const stale = rows.filter((row) => !allow.has(String(row.titulo || "").toLowerCase().trim()))
  if (stale.length === 0) {
    return { deleted: 0, staleTitles: [] }
  }

  const ids = stale.map((row) => row.id).filter(Boolean)
  const chunkSize = 100
  let deleted = 0
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize)
    const { error: deleteError } = await supabase.from("proyectos").delete().in("id", chunk)
    if (deleteError) {
      throw new Error(`prune delete failed: ${deleteError.message}`)
    }
    deleted += chunk.length
  }

  return { deleted, staleTitles: stale.map((row) => row.titulo) }
}

async function importCatalog(entries, args) {
  const supabase = createSupabaseAdminClient()
  const results = []

  for (const entry of entries) {
    const result = await upsertProject(
      supabase,
      entry,
      args.overwrite,
      args.keepRemoteUrls,
      args.maxGalleryImages
    )
    results.push(result)
    const suffix = result.reason ? ` (${result.reason})` : ""
    console.log(`[import] ${result.status.toUpperCase()} - ${entry.title}${suffix}`)
  }

  const counters = {
    inserted: results.filter((result) => result.status === "inserted").length,
    updated: results.filter((result) => result.status === "updated").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
  }

  console.log("")
  console.log("Import summary")
  console.log(`- Inserted: ${counters.inserted}`)
  console.log(`- Updated: ${counters.updated}`)
  console.log(`- Skipped: ${counters.skipped}`)
  console.log(`- Failed: ${counters.failed}`)

  if (args.pruneMissing) {
    try {
      const pruned = await pruneMissingProjects(
        supabase,
        entries.map((entry) => entry.title)
      )
      console.log(`- Pruned missing rows: ${pruned.deleted}`)
      if (pruned.staleTitles.length > 0) {
        console.log("  Removed titles:")
        for (const title of pruned.staleTitles) {
          console.log(`  - ${title}`)
        }
      }
    } catch (error) {
      console.log(`- Pruned missing rows: failed (${error.message})`)
      process.exitCode = 1
    }
  }

  if (counters.failed > 0) {
    process.exitCode = 1
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const entries = args.inputJsonPath
    ? await loadCatalogFromJson(args.inputJsonPath)
    : await buildCatalogFromSources(args)

  if (entries.length === 0) {
    throw new Error("No catalog entries found. Check your folder paths and source files.")
  }

  await writeCatalogFiles(entries, args.catalogJsonPath, args.catalogCsvPath, args.inputJsonPath ? null : args.portfolioDir)
  summarizeCatalog(entries)
  console.log(`[catalog] JSON -> ${args.catalogJsonPath}`)
  console.log(`[catalog] CSV  -> ${args.catalogCsvPath}`)

  if (!args.execute) {
    console.log("")
    console.log("Dry-run complete. Re-run with --execute to upload and write to Supabase.")
    return
  }

  console.log("")
  console.log("Running import execution...")
  await importCatalog(entries, args)
}

main().catch((error) => {
  console.error(`[error] ${error.message}`)
  process.exit(1)
})
