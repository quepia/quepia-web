// CSV con neutralización de fórmulas (celdas que empiezan con = + - @).
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "﻿"
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const cell = (value: unknown) => {
    if (value === null || value === undefined) return ""
    let text = typeof value === "object" ? JSON.stringify(value) : String(value)
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `﻿${[headers.join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n")}\n`
}
