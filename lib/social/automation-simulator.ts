// Simulación local de reglas comentario→DM según el comportamiento documentado
// por Zernio (matchMode contains/word/exact, excludeKeywords con el mismo modo,
// typoTolerance solo con word: 1 edición para 4–7 caracteres, 2 desde 8).
// Es una aproximación para vista previa: no envía nada ni llama al proveedor.

export type SimulationRule = {
  keywords?: string[]
  exclude_keywords?: string[]
  match_mode?: "contains" | "word" | "exact"
  typo_tolerance?: boolean
  platform_post_id?: string | null
  trigger?: "comment" | "story_reply"
}

export type SimulationComment = { id: string; text: string | null; platform_post_id?: string | null; is_reply?: boolean }

const normalize = (value: string) => value.toLocaleLowerCase("es").normalize("NFC").trim()
const tokenize = (value: string) => normalize(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean)

export function levenshtein(a: string, b: string, limit = 2): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j += 1) {
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > limit) return limit + 1
    previous = current
  }
  return previous[b.length]
}

function typoBudget(keyword: string) {
  if (keyword.length < 4) return 0
  return keyword.length >= 8 ? 2 : 1
}

export function keywordMatches(text: string, keyword: string, mode: SimulationRule["match_mode"] = "contains", typoTolerance = false) {
  const normalizedText = normalize(text)
  const normalizedKeyword = normalize(keyword)
  if (!normalizedKeyword) return false
  if (mode === "exact") return normalizedText === normalizedKeyword
  if (mode === "word") {
    const keywordTokens = tokenize(normalizedKeyword)
    const tokens = tokenize(normalizedText)
    if (keywordTokens.length === 1) {
      const budget = typoTolerance ? typoBudget(keywordTokens[0]) : 0
      return tokens.some((token) => token === keywordTokens[0] || (budget > 0 && levenshtein(token, keywordTokens[0], budget) <= budget))
    }
    return ` ${tokens.join(" ")} `.includes(` ${keywordTokens.join(" ")} `)
  }
  return normalizedText.includes(normalizedKeyword)
}

export function simulateRule(rule: SimulationRule, comments: SimulationComment[]) {
  const keywords = (rule.keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean)
  const excludes = (rule.exclude_keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean)
  const mode = rule.match_mode ?? "contains"
  const results = comments.map((comment) => {
    const text = comment.text ?? ""
    if (rule.platform_post_id && comment.platform_post_id && comment.platform_post_id !== rule.platform_post_id) {
      return { id: comment.id, matched: false, reason: "otra_publicación" }
    }
    const excludedBy = excludes.find((keyword) => keywordMatches(text, keyword, mode, false))
    const matchedKeyword = keywords.length === 0 ? "(cualquier comentario)" : keywords.find((keyword) => keywordMatches(text, keyword, mode, Boolean(rule.typo_tolerance)))
    if (matchedKeyword && excludedBy) return { id: comment.id, matched: false, reason: `excluido por “${excludedBy}”` }
    if (matchedKeyword) return { id: comment.id, matched: true, reason: `coincide con “${matchedKeyword}”` }
    return { id: comment.id, matched: false, reason: "sin coincidencia" }
  })
  return {
    total: results.length,
    matched: results.filter((result) => result.matched).length,
    results,
    note: "Simulación local sin envíos. La coincidencia real la decide Zernio; tolerancia a errores y reglas de audiencia pueden diferir levemente.",
  }
}

/** Traduce la configuración local al cuerpo documentado de POST/PATCH /comment-automations. */
export function toZernioAutomationBody(input: {
  name: string
  config: Record<string, unknown>
  zernioProfileId?: string | null
  zernioAccountId?: string | null
  forCreate: boolean
}) {
  const config = input.config
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()) : undefined)
  const body: Record<string, unknown> = {
    name: input.name,
    trigger: config.trigger ?? "comment",
    keywords: list(config.keywords) ?? [],
    matchMode: config.match_mode ?? "contains",
    excludeKeywords: list(config.exclude_keywords),
    typoTolerance: config.typo_tolerance === true ? true : undefined,
    dmMessage: config.dm_message,
    buttons: Array.isArray(config.buttons) ? config.buttons : undefined,
    commentReply: typeof config.comment_reply === "string" && config.comment_reply.trim() ? config.comment_reply : undefined,
    dmMessageVariations: list(config.dm_message_variations),
    commentReplyVariations: list(config.comment_reply_variations),
    dmDelaySeconds: typeof config.dm_delay_seconds === "number" ? config.dm_delay_seconds : undefined,
    alsoMatchInDms: config.also_match_in_dms === true ? true : undefined,
  }
  if (input.forCreate) {
    body.profileId = input.zernioProfileId
    body.accountId = input.zernioAccountId
    if (typeof config.platform_post_id === "string" && config.platform_post_id) body.platformPostId = config.platform_post_id
  }
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined))
}
