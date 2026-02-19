#!/usr/bin/env node

import fs from "node:fs/promises"
import path from "node:path"

const DEFAULT_BASE_URL = "https://lautarolopezlabrin.myportfolio.com"
const DEFAULT_WORK_PATH = "/work"
const DEFAULT_OUTPUT_DIR = path.join("data", "myportfolio-downloads")
const DEFAULT_CONCURRENCY = 6
const DEFAULT_RETRIES = 3

const RESERVED_ROOT_PATHS = new Set([
  "",
  "work",
  "about",
  "contact",
  "terms",
  "privacy",
  "privacy-policy",
  "sitemap.xml",
])

function printUsage() {
  console.log(`
MyPortfolio Bulk Downloader

Usage:
  node scripts/myportfolio-bulk-download.mjs [options]

Options:
  --base-url <url>          MyPortfolio base URL (default: ${DEFAULT_BASE_URL})
  --work-path <path>        Work listing path (default: ${DEFAULT_WORK_PATH})
  --output-dir <path>       Output folder for downloaded images (default: ${DEFAULT_OUTPUT_DIR})
  --project-limit <number>  Max number of projects to download
  --only <slug-or-url>      Download only project(s) matching this slug or URL (repeatable)
  --concurrency <number>    Parallel image downloads per project (default: ${DEFAULT_CONCURRENCY})
  --retries <number>        Retry attempts per HTTP request (default: ${DEFAULT_RETRIES})
  --skip-sitemap            Do not use sitemap discovery fallback
  --help                    Show this help
`.trim())
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    workPath: DEFAULT_WORK_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
    projectLimit: null,
    onlyProjects: [],
    concurrency: DEFAULT_CONCURRENCY,
    retries: DEFAULT_RETRIES,
    skipSitemap: false,
  }

  const args = [...argv]
  while (args.length > 0) {
    const token = args.shift()
    if (!token) break

    switch (token) {
      case "--base-url":
        options.baseUrl = mustReadFlagValue(args, token)
        break
      case "--work-path":
        options.workPath = mustReadFlagValue(args, token)
        break
      case "--output-dir":
        options.outputDir = mustReadFlagValue(args, token)
        break
      case "--project-limit": {
        const value = Number.parseInt(mustReadFlagValue(args, token), 10)
        if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${token}`)
        options.projectLimit = value
        break
      }
      case "--only":
        options.onlyProjects.push(mustReadFlagValue(args, token).trim().toLowerCase())
        break
      case "--concurrency": {
        const value = Number.parseInt(mustReadFlagValue(args, token), 10)
        if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${token}`)
        options.concurrency = value
        break
      }
      case "--retries": {
        const value = Number.parseInt(mustReadFlagValue(args, token), 10)
        if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${token}`)
        options.retries = value
        break
      }
      case "--skip-sitemap":
        options.skipSitemap = true
        break
      case "--help":
      case "-h":
        printUsage()
        process.exit(0)
      default:
        throw new Error(`Unknown argument: ${token}`)
    }
  }

  options.baseUrl = normalizeBaseUrl(options.baseUrl)
  options.workPath = normalizeWorkPath(options.workPath)
  return options
}

function mustReadFlagValue(args, flagName) {
  const value = args.shift()
  if (!value) throw new Error(`Missing value for ${flagName}`)
  return value
}

function normalizeBaseUrl(rawUrl) {
  const parsed = new URL(rawUrl)
  parsed.hash = ""
  parsed.search = ""
  parsed.pathname = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "")
  return parsed.toString().replace(/\/$/, "")
}

function normalizeWorkPath(workPath) {
  const normalized = workPath.trim()
  if (!normalized) return DEFAULT_WORK_PATH
  if (!normalized.startsWith("/")) return `/${normalized}`
  return normalized
}

function normalizePageUrl(rawUrl) {
  const parsed = new URL(rawUrl)
  parsed.hash = ""
  parsed.search = ""
  const cleanPath = parsed.pathname.replace(/\/+$/, "")
  parsed.pathname = cleanPath.length > 0 ? cleanPath : "/"
  return parsed.toString()
}

function ensureUniqueArray(values) {
  return [...new Set(values)]
}

function matchesOnlyProjectFilters(url, filters) {
  if (!filters || filters.length === 0) return true
  const normalizedUrl = normalizePageUrl(url).toLowerCase()
  const normalizedPath = new URL(url).pathname.toLowerCase().replace(/\/+$/, "")

  return filters.some((filterValue) => {
    if (!filterValue) return false
    if (normalizedUrl.includes(filterValue)) return true
    if (normalizedPath.endsWith(`/${filterValue.replace(/^\/+/, "")}`)) return true
    return false
  })
}

function slugify(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80)
}

function sanitizePathSegment(input, fallback = "project") {
  const slug = slugify(input)
  return slug.length > 0 ? slug : fallback
}

function extractLinksFromHtml(html, baseUrl) {
  const urls = []
  const hrefPattern = /href=["']([^"'#]+)["']/gi
  for (const match of html.matchAll(hrefPattern)) {
    const href = match[1]
    try {
      const absolute = new URL(href, baseUrl)
      urls.push(absolute.toString())
    } catch {
      // ignore malformed URL
    }
  }
  return urls
}

function isLikelyProjectUrl(urlString, baseOrigin, workPath) {
  try {
    const parsed = new URL(urlString)
    if (parsed.origin !== baseOrigin) return false

    const pathname = parsed.pathname.replace(/\/+$/, "")
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length === 0) return false
    if (path.extname(pathname)) return false

    const firstSegment = segments[0].toLowerCase()
    const normalizedWorkPath = workPath.replace(/^\//, "").toLowerCase()

    if (pathname === workPath || pathname === `${workPath}/`) return false
    if (firstSegment === normalizedWorkPath && segments.length === 1) return false
    if (RESERVED_ROOT_PATHS.has(firstSegment)) return false

    return true
  } catch {
    return false
  }
}

async function fetchWithRetry(url, options, retries) {
  let attempt = 0
  let lastError = null

  while (attempt < retries) {
    attempt += 1
    try {
      const response = await fetch(url, options)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
      await sleep(250 * attempt)
    }
  }

  throw new Error(`Request failed for ${url}: ${lastError?.message || "unknown error"}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchText(url, retries) {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "user-agent": "Mozilla/5.0 (myportfolio-bulk-downloader)",
        accept: "text/html,application/xml,application/xhtml+xml",
      },
    },
    retries
  )
  return response.text()
}

async function discoverProjectUrlsFromWork(baseUrl, workPath, retries) {
  const workUrl = normalizePageUrl(new URL(workPath, baseUrl).toString())
  const html = await fetchText(workUrl, retries)
  const links = extractLinksFromHtml(html, baseUrl)
  const baseOrigin = new URL(baseUrl).origin

  return ensureUniqueArray(
    links
      .map((url) => normalizePageUrl(url))
      .filter((url) => isLikelyProjectUrl(url, baseOrigin, workPath))
  )
}

function extractLocTags(xml) {
  const matches = []
  const pattern = /<loc>([^<]+)<\/loc>/gi
  for (const match of xml.matchAll(pattern)) {
    matches.push(match[1].trim())
  }
  return matches
}

async function collectSitemapUrls(sitemapUrl, retries, visited = new Set()) {
  const normalized = normalizePageUrl(sitemapUrl)
  if (visited.has(normalized)) return []
  visited.add(normalized)

  const xml = await fetchText(normalized, retries)
  const locs = extractLocTags(xml)

  const nestedSitemapUrls = []
  const pageUrls = []

  for (const loc of locs) {
    if (loc.toLowerCase().endsWith(".xml")) {
      nestedSitemapUrls.push(loc)
    } else {
      pageUrls.push(loc)
    }
  }

  const nestedPageUrls = []
  for (const nestedUrl of nestedSitemapUrls) {
    const nested = await collectSitemapUrls(nestedUrl, retries, visited)
    nestedPageUrls.push(...nested)
  }

  return [...pageUrls, ...nestedPageUrls]
}

async function discoverProjectUrlsFromSitemap(baseUrl, workPath, retries) {
  const sitemapUrl = new URL("/sitemap.xml", baseUrl).toString()
  const urls = await collectSitemapUrls(sitemapUrl, retries)
  const baseOrigin = new URL(baseUrl).origin

  return ensureUniqueArray(
    urls
      .map((url) => normalizePageUrl(url))
      .filter((url) => isLikelyProjectUrl(url, baseOrigin, workPath))
  )
}

function extractMetaTag(html, propertyOrName) {
  const escaped = propertyOrName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return htmlUnescape(match[1])
  }

  return null
}

function htmlUnescape(input) {
  return String(input || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function extractTitleFromHtml(html, pageUrl) {
  return (
    extractMetaTag(html, "og:title") ||
    html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ||
    sanitizePathSegment(new URL(pageUrl).pathname.split("/").filter(Boolean).pop(), "project")
  )
}

function extractResponsiveWidth(urlString) {
  const rwMatch = urlString.match(/_rw_(\d+)(?=\.[a-z0-9]+(?:\?|$))/i)
  if (rwMatch?.[1]) {
    return Number.parseInt(rwMatch[1], 10)
  }

  try {
    const parsed = new URL(urlString)
    const width = Number.parseInt(parsed.searchParams.get("w") || "", 10)
    return Number.isFinite(width) ? width : 0
  } catch {
    return 0
  }
}

function imageVariantKey(urlString) {
  try {
    const parsed = new URL(urlString)
    const normalizedPath = parsed.pathname.replace(/_rw_\d+(?=\.[a-z0-9]+$)/i, "")
    return `${parsed.hostname}${normalizedPath}`
  } catch {
    return urlString
  }
}

function extractImageUrlsFromHtml(html, pageUrl) {
  const candidates = []
  const pushCandidate = (rawValue) => {
    if (!rawValue) return
    const cleaned = rawValue
      .trim()
      .replace(/^url\((.*)\)$/i, "$1")
      .replace(/^['"]|['"]$/g, "")

    if (!cleaned || cleaned.startsWith("data:")) return

    try {
      const absolute = new URL(cleaned, pageUrl)
      if (!absolute.hostname.includes("cdn.myportfolio.com")) return
      if (!absolute.pathname.match(/\.(jpg|jpeg|png|webp|avif)$/i)) return
      candidates.push(absolute.toString())
    } catch {
      // ignore malformed URL
    }
  }

  const directAttrPattern = /(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi
  for (const match of html.matchAll(directAttrPattern)) {
    pushCandidate(match[1])
  }

  const srcSetPattern = /srcset=["']([^"']+)["']/gi
  for (const match of html.matchAll(srcSetPattern)) {
    const srcSet = match[1]
    srcSet
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .forEach(pushCandidate)
  }

  const styleUrlPattern = /url\(([^)]+)\)/gi
  for (const match of html.matchAll(styleUrlPattern)) {
    pushCandidate(match[1])
  }

  const bestByKey = new Map()
  for (const candidate of candidates) {
    const key = imageVariantKey(candidate)
    const width = extractResponsiveWidth(candidate)
    const existing = bestByKey.get(key)
    if (!existing || width >= existing.width) {
      bestByKey.set(key, { url: candidate, width })
    }
  }

  return [...bestByKey.values()].map((item) => item.url)
}

function guessExtensionFromUrl(urlString, contentType) {
  if (contentType?.includes("image/jpeg")) return ".jpg"
  if (contentType?.includes("image/png")) return ".png"
  if (contentType?.includes("image/webp")) return ".webp"
  if (contentType?.includes("image/avif")) return ".avif"

  try {
    const parsed = new URL(urlString)
    const ext = path.extname(parsed.pathname).toLowerCase()
    if ([".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext)) return ext
  } catch {
    // ignore
  }

  return ".jpg"
}

async function downloadImage(url, targetDir, imageIndex, retries) {
  const response = await fetchWithRetry(
    url,
    {
      headers: {
        "user-agent": "Mozilla/5.0 (myportfolio-bulk-downloader)",
        accept: "image/*,*/*;q=0.8",
      },
    },
    retries
  )

  const buffer = Buffer.from(await response.arrayBuffer())
  const ext = guessExtensionFromUrl(url, response.headers.get("content-type"))
  const filename = `${String(imageIndex + 1).padStart(2, "0")}${ext}`
  const absolutePath = path.join(targetDir, filename)
  await fs.writeFile(absolutePath, buffer)

  return {
    filename,
    sourceUrl: url,
    bytes: buffer.length,
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0

  async function runner() {
    while (cursor < items.length) {
      const currentIndex = cursor
      cursor += 1
      results[currentIndex] = await worker(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runner())
  await Promise.all(workers)
  return results
}

async function processProject(projectUrl, projectIndex, options) {
  const pageHtml = await fetchText(projectUrl, options.retries)
  const projectTitle = extractTitleFromHtml(pageHtml, projectUrl)
  const imageUrls = extractImageUrlsFromHtml(pageHtml, projectUrl)

  if (imageUrls.length === 0) {
    return {
      projectUrl,
      title: projectTitle,
      slug: sanitizePathSegment(new URL(projectUrl).pathname.split("/").filter(Boolean).pop(), `project-${projectIndex + 1}`),
      downloaded: 0,
      skipped: true,
      reason: "no images found",
      images: [],
    }
  }

  const projectSlug = sanitizePathSegment(projectTitle, sanitizePathSegment(new URL(projectUrl).pathname.split("/").filter(Boolean).pop(), `project-${projectIndex + 1}`))
  const folderName = `${String(projectIndex + 1).padStart(2, "0")}_${projectSlug}`
  const projectDir = path.join(options.outputDir, folderName)
  await fs.mkdir(projectDir, { recursive: true })

  const images = await runWithConcurrency(imageUrls, options.concurrency, async (url, imageIndex) => {
    try {
      return await downloadImage(url, projectDir, imageIndex, options.retries)
    } catch (error) {
      return {
        filename: null,
        sourceUrl: url,
        bytes: 0,
        error: error.message,
      }
    }
  })

  const downloadedCount = images.filter((image) => image.filename).length

  return {
    projectUrl,
    title: projectTitle,
    slug: projectSlug,
    folderName,
    downloaded: downloadedCount,
    skipped: false,
    reason: downloadedCount === 0 ? "all image downloads failed" : null,
    images,
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  await fs.mkdir(options.outputDir, { recursive: true })

  const discoveredFromWork = await discoverProjectUrlsFromWork(options.baseUrl, options.workPath, options.retries)
  console.log(`[discover] /work links: ${discoveredFromWork.length}`)

  let discoveredFromSitemap = []
  if (!options.skipSitemap) {
    try {
      discoveredFromSitemap = await discoverProjectUrlsFromSitemap(options.baseUrl, options.workPath, options.retries)
      console.log(`[discover] sitemap links: ${discoveredFromSitemap.length}`)
    } catch (error) {
      console.warn(`[discover] sitemap skipped: ${error.message}`)
    }
  }

  const discoveredUrls = ensureUniqueArray([...discoveredFromWork, ...discoveredFromSitemap])
  if (discoveredUrls.length === 0) {
    throw new Error("No project URLs discovered. Verify --base-url and --work-path.")
  }

  const filteredUrls = discoveredUrls.filter((url) => matchesOnlyProjectFilters(url, options.onlyProjects))
  if (filteredUrls.length === 0) {
    throw new Error("No project URLs matched the provided --only filters.")
  }

  const limitedUrls = options.projectLimit ? filteredUrls.slice(0, options.projectLimit) : filteredUrls
  console.log(`[discover] total project URLs queued: ${limitedUrls.length}`)

  const results = []
  for (const [index, projectUrl] of limitedUrls.entries()) {
    try {
      const result = await processProject(projectUrl, index, options)
      results.push(result)
      if (result.skipped) {
        console.log(`[project] SKIP ${projectUrl} (${result.reason})`)
      } else {
        console.log(`[project] OK   ${projectUrl} -> ${result.downloaded} imagen(es)`)
      }
    } catch (error) {
      results.push({
        projectUrl,
        skipped: true,
        downloaded: 0,
        reason: error.message,
        images: [],
      })
      console.log(`[project] FAIL ${projectUrl} (${error.message})`)
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    workPath: options.workPath,
    outputDir: options.outputDir,
    totals: {
      queuedProjects: limitedUrls.length,
      processedProjects: results.length,
      successfulProjects: results.filter((result) => !result.skipped && result.downloaded > 0).length,
      downloadedImages: results.reduce((sum, result) => sum + (result.downloaded || 0), 0),
    },
    projects: results,
  }

  const manifestPath = path.join(options.outputDir, "manifest.json")
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8")

  console.log("")
  console.log("Download summary")
  console.log(`- Output dir: ${options.outputDir}`)
  console.log(`- Projects queued: ${manifest.totals.queuedProjects}`)
  console.log(`- Projects with images: ${manifest.totals.successfulProjects}`)
  console.log(`- Images downloaded: ${manifest.totals.downloadedImages}`)
  console.log(`- Manifest: ${manifestPath}`)
}

main().catch((error) => {
  console.error(`[error] ${error.message}`)
  process.exit(1)
})
