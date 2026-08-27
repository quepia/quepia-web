"use client"

import React, { useMemo } from "react"
import { cn } from "@/lib/sistema/utils"

/**
 * Task descriptions are written (and generated) as plain text with real
 * structure: uppercase section headings, timecodes, "Clave: valor" lines and
 * dash bullets, separated by blank lines. Rendering them as a single text node
 * collapses all of that into a wall of text, so we parse the shape back out and
 * give each kind of line its own typographic treatment.
 */

type Block =
    | { kind: "heading"; text: string }
    | { kind: "timecode"; text: string }
    | { kind: "bullets"; items: string[] }
    | { kind: "paragraph"; lines: string[] }

const URL_RE = /(https?:\/\/[^\s<>()]+)/g
const TIMECODE_RE = /^\d{1,2}:\d{2}(?:\s*(?:a|-|–|—|→|to)\s*\d{1,2}:\d{2})?$/i
const BULLET_RE = /^[-–—•*]\s+(.*)$/
const KEY_VALUE_RE = /^([\p{Lu}][\p{L}\d ./]{1,26}):\s+(.+)$/u
const MD_HEADING_RE = /^#{1,4}\s+(.*)$/

function isUppercaseHeading(line: string): boolean {
    if (line.length > 72) return false
    if (/^https?:/i.test(line)) return false
    if (/[.,;]$/.test(line)) return false
    const letters = line.replace(/[^\p{L}]/gu, "")
    if (letters.length < 3) return false
    return letters === letters.toLocaleUpperCase("es-AR")
}

export function parseDescription(text: string): Block[] {
    const blocks: Block[] = []
    let paragraph: string[] = []
    let bullets: string[] = []

    const flushParagraph = () => {
        if (paragraph.length > 0) {
            blocks.push({ kind: "paragraph", lines: paragraph })
            paragraph = []
        }
    }
    const flushBullets = () => {
        if (bullets.length > 0) {
            blocks.push({ kind: "bullets", items: bullets })
            bullets = []
        }
    }
    const flushAll = () => {
        flushBullets()
        flushParagraph()
    }

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim()

        if (line === "") {
            flushAll()
            continue
        }

        const mdHeading = line.match(MD_HEADING_RE)
        if (mdHeading) {
            flushAll()
            blocks.push({ kind: "heading", text: mdHeading[1].trim() })
            continue
        }

        if (isUppercaseHeading(line)) {
            flushAll()
            blocks.push({ kind: "heading", text: line })
            continue
        }

        if (TIMECODE_RE.test(line)) {
            flushAll()
            blocks.push({ kind: "timecode", text: line })
            continue
        }

        const bullet = line.match(BULLET_RE)
        if (bullet) {
            flushParagraph()
            bullets.push(bullet[1].trim())
            continue
        }

        flushBullets()
        paragraph.push(line)
    }

    flushAll()
    return blocks
}

function shortenUrl(url: string): string {
    try {
        const parsed = new URL(url)
        const tail = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "")
        const label = `${parsed.hostname.replace(/^www\./, "")}${tail}`
        return label.length > 46 ? `${label.slice(0, 45)}…` : label
    } catch {
        return url
    }
}

/** Turns bare URLs into links; everything else stays as text. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
    return text.split(URL_RE).map((part, i) => {
        if (!part) return null
        if (/^https?:\/\//i.test(part)) {
            return (
                <a
                    key={`${keyPrefix}-${i}`}
                    href={part}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="break-words text-quepia-cyan/85 underline decoration-quepia-cyan/30 underline-offset-2 transition-colors hover:decoration-quepia-cyan"
                    title={part}
                >
                    {shortenUrl(part)}
                </a>
            )
        }
        return <span key={`${keyPrefix}-${i}`}>{part}</span>
    })
}

/** "Imagen: primer plano…" renders the label with its own weight. */
function renderLine(line: string, keyPrefix: string): React.ReactNode {
    const keyValue = line.match(KEY_VALUE_RE)
    if (keyValue) {
        return (
            <>
                <span className="font-medium text-white/50">{keyValue[1]}: </span>
                {renderInline(keyValue[2], keyPrefix)}
            </>
        )
    }
    return renderInline(line, keyPrefix)
}

export function RichDescription({ text, className }: { text: string; className?: string }) {
    const blocks = useMemo(() => parseDescription(text), [text])

    return (
        <div className={cn("text-[13px] leading-[1.6] text-white/65", className)}>
            {blocks.map((block, i) => {
                switch (block.kind) {
                    case "heading":
                        return (
                            <h4
                                key={i}
                                className="mt-5 border-b border-white/[0.07] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45 first:mt-0"
                            >
                                {block.text}
                            </h4>
                        )
                    case "timecode":
                        return (
                            <div key={i} className="mt-4 first:mt-0">
                                <span className="inline-flex rounded bg-[rgba(42,231,228,0.1)] px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-quepia-cyan/90">
                                    {block.text}
                                </span>
                            </div>
                        )
                    case "bullets":
                        return (
                            <ul key={i} className="mt-2 space-y-1 first:mt-0">
                                {block.items.map((item, j) => (
                                    <li
                                        key={j}
                                        className="relative pl-4 before:absolute before:left-[3px] before:top-[0.6em] before:h-[3px] before:w-[3px] before:rounded-full before:bg-white/30"
                                    >
                                        {renderLine(item, `${i}-${j}`)}
                                    </li>
                                ))}
                            </ul>
                        )
                    default:
                        return (
                            <div key={i} className="mt-2 space-y-0.5 first:mt-0">
                                {block.lines.map((line, j) => (
                                    <p key={j}>{renderLine(line, `${i}-${j}`)}</p>
                                ))}
                            </div>
                        )
                }
            })}
        </div>
    )
}

/**
 * One-line summary for compact surfaces (kanban cards): drops the section
 * heading when it is immediately followed by real content.
 */
export function descriptionPreview(text: string, maxLines = 2): string {
    const lines = text
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)

    const body = lines.filter(l => !isUppercaseHeading(l) && !MD_HEADING_RE.test(l) && !TIMECODE_RE.test(l))
    const source = body.length > 0 ? body : lines
    return source.slice(0, maxLines).join(" · ")
}
