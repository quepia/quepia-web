import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const redirectTo = searchParams.get('redirectTo') || '/sistema';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                console.log('[Auth Callback] User Logged In:', user.email);

                // Check if user exists in sistema_users
                const { data: sistemaUser } = await supabase
                    .from('sistema_users')
                    .select('id')
                    .eq('id', user.id)
                    .single();

                if (!sistemaUser) {
                    // Auto-register new user
                    console.log('[Auth Callback] Registering new user:', user.email);
                    
                    const { error: createError } = await supabase
                        .from('sistema_users')
                        .insert({
                            id: user.id,
                            email: user.email!,
                            nombre: user.user_metadata.full_name || user.email?.split('@')[0] || 'Usuario',
                            avatar_url: user.user_metadata.avatar_url,
                        });

                    if (createError) {
                        console.error('[Auth Callback] Error creating user:', createError);
                        // Optional: Redirect to error page or let them proceed (they might see setup modal)
                    }
                }

                return NextResponse.redirect(`${origin}${redirectTo}`);
            }
        }
    }

    // Auth error - redirect to login
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
