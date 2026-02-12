"use client"

const STORAGE_KEY = "quepia:experience:metrics:v1"

type MetricKey =
    | "task_move_blocked"
    | "task_deleted"
    | "review_approved"
    | "review_changes_requested"
    | "client_comment_sent"
    | "asset_approved"
    | "asset_changes_requested"
    | "errors_shown"

interface MetricStore {
    weekStart: string
    counters: Record<MetricKey, number>
    updatedAt: string
}

function getWeekStart(now = new Date()): string {
    const date = new Date(now)
    const day = date.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    date.setDate(date.getDate() + diffToMonday)
    date.setHours(0, 0, 0, 0)
    return date.toISOString().split("T")[0]
}

function defaultCounters(): Record<MetricKey, number> {
    return {
        task_move_blocked: 0,
        task_deleted: 0,
        review_approved: 0,
        review_changes_requested: 0,
        client_comment_sent: 0,
        asset_approved: 0,
        asset_changes_requested: 0,
        errors_shown: 0,
    }
}

function readStore(): MetricStore {
    if (typeof window === "undefined") {
        return {
            weekStart: getWeekStart(),
            counters: defaultCounters(),
            updatedAt: new Date().toISOString(),
        }
    }

    try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) {
            return {
                weekStart: getWeekStart(),
                counters: defaultCounters(),
                updatedAt: new Date().toISOString(),
            }
        }
        const parsed = JSON.parse(raw) as MetricStore
        const currentWeekStart = getWeekStart()
        if (parsed.weekStart !== currentWeekStart) {
            return {
                weekStart: currentWeekStart,
                counters: defaultCounters(),
                updatedAt: new Date().toISOString(),
            }
        }
        return {
            weekStart: parsed.weekStart || currentWeekStart,
            counters: { ...defaultCounters(), ...(parsed.counters || {}) },
            updatedAt: parsed.updatedAt || new Date().toISOString(),
        }
    } catch {
        return {
            weekStart: getWeekStart(),
            counters: defaultCounters(),
            updatedAt: new Date().toISOString(),
        }
    }
}

function writeStore(store: MetricStore) {
    if (typeof window === "undefined") return
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
    } catch {
        // noop
    }
}

export function trackExperienceMetric(key: MetricKey, amount = 1) {
    const store = readStore()
    store.counters[key] = (store.counters[key] || 0) + amount
    store.updatedAt = new Date().toISOString()
    writeStore(store)
}

export function readExperienceMetrics() {
    return readStore()
}

export type { MetricKey }

