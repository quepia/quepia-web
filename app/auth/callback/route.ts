import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const redirectTo = searchParams.get('redirectTo') || '/admin';

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            // Check if user is authorized
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                const { data: authorizedUser } = await supabase
                    .from('authorized_users')
                    .select('email')
                    .eq('email', user.email)
                    .single();

                if (authorizedUser) {
                    return NextResponse.redirect(`${origin}${redirectTo}`);
                } else {
                    // User not authorized - sign them out and redirect with error
                    await supabase.auth.signOut();
                    return NextResponse.redirect(`${origin}/?error=unauthorized`);
                }
            }
        }
    }

    // Auth error - redirect to login
    return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
