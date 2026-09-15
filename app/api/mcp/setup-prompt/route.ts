import { NextResponse } from 'next/server'
import { shouldShowMcpSetupPrompt } from '@/lib/mcp/oauth'
import { getMcpOAuthLifecycle } from '@/lib/mcp/oauth-server'
import { getMcpWebSession } from '@/lib/mcp/server'

export const dynamic = 'force-dynamic'

export async function GET() {
    let showMcpSetup = false
    try {
        // Preserve the verified first-party session and database admin check.
        const session = await getMcpWebSession()
        const lifecycle = await getMcpOAuthLifecycle(session)
        showMcpSetup = shouldShowMcpSetupPrompt(lifecycle)
    } catch {
        // Fail closed for unauthenticated/non-admin users and incomplete state.
    }
    return NextResponse.json({ showMcpSetup }, {
        headers: { 'Cache-Control': 'private, no-store' },
    })
}
