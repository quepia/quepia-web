import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeInternalRedirect } from '@/lib/mcp/oauth';
import { createAdminClient } from '@/lib/sistema/supabase/admin';
import {
    isAuthorizedSistemaUser,
    type SistemaAccessProfile,
} from '@/lib/sistema/auth/authorization';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const redirectTo = normalizeInternalRedirect(
        searchParams.get('redirectTo'),
        '/sistema'
    );

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                // Authentication proves the Google identity, but authorization is
                // controlled exclusively by the admin-managed sistema_users list.
                // Use the server-only client so a denied user cannot influence or
                // self-create the row used for this decision.
                const admin = createAdminClient();
                const { data: sistemaUser, error: accessError } = await admin
                    .from('sistema_users')
                    .select('id, email, is_authorized, is_active, deleted_at')
                    .eq('id', user.id)
                    .maybeSingle();

                if (
                    accessError ||
                    !isAuthorizedSistemaUser(
                        user,
                        sistemaUser as SistemaAccessProfile | null,
                    )
                ) {
                    if (accessError) {
                        console.error('[Auth Callback] Authorization lookup failed', {
                            code: accessError.code,
                        });
                    }

                    return NextResponse.redirect(
                        new URL('/auth/access-denied', origin),
                    );
                }

                return NextResponse.redirect(new URL(redirectTo, origin));
            }
        }
    }

    // Auth error - redirect to login
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
