'use client'

import { useEffect, useState } from 'react'
import DashboardClient from './dashboard-client'

export default function DashboardBoot() {
    const [showMcpSetup, setShowMcpSetup] = useState(false)

    useEffect(() => {
        const controller = new AbortController()
        // This optional notice must not block the dashboard or serialize user
        // mutations behind a slow Server Action. Keep its read on a separate GET.
        void fetch('/api/mcp/setup-prompt', {
            cache: 'no-store',
            signal: controller.signal,
        }).then(async (response) => {
            if (!response.ok) return
            const result = await response.json()
            if (!controller.signal.aborted) {
                setShowMcpSetup(result.showMcpSetup === true)
            }
        }).catch(() => {
            // An unavailable optional notice never grants privileges.
        })
        return () => controller.abort()
    }, [])

    return <DashboardClient showMcpSetup={showMcpSetup} />
}
