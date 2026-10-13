"use client"

import { useEffect, useRef } from "react"

/** Keep initial/manual loads separate; pause periodic work while hidden. */
export function useVisiblePolling(callback: () => unknown | Promise<unknown>, delay: number, enabled = true) {
  const latest = useRef(callback)
  useEffect(() => { latest.current = callback }, [callback])
  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(() => void tick(), delay)
    }
    const tick = async () => {
      if (stopped || running || document.visibilityState !== "visible") return
      running = true
      try { await latest.current() }
      catch (error) { console.error("[Polling]", error) }
      finally { running = false; schedule() }
    }
    const onVisibility = () => {
      clearTimeout(timer)
      if (document.visibilityState === "visible") void tick()
    }
    document.addEventListener("visibilitychange", onVisibility)
    schedule()
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [delay, enabled])
}
