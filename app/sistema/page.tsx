import type { Metadata } from 'next';
import DashboardClient from './dashboard-client'
import { shouldShowMcpSetupPrompt } from '@/lib/mcp/oauth'
import { getMcpOAuthLifecycle } from '@/lib/mcp/oauth-server'
import { getMcpWebSession } from '@/lib/mcp/server'

export const metadata: Metadata = {
    title: 'Sistema | Quepia',
    robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic'

async function shouldPromptMcpSetup(): Promise<boolean> {
    try {
        const session = await getMcpWebSession()
        const lifecycle = await getMcpOAuthLifecycle(session)
        return shouldShowMcpSetupPrompt(lifecycle)
    } catch {
        // Fail closed: una sesión no admin o un estado incompleto nunca recibe
        // la señal de configuración.
        return false
    }
}

export default async function Page() {
    const showMcpSetup = await shouldPromptMcpSetup()
    return <DashboardClient showMcpSetup={showMcpSetup} />
}
