import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // Redirect /admin to /sistema
    if (request.nextUrl.pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/sistema';
        
        // Map admin paths to sistema views
        if (request.nextUrl.pathname.includes('/proyectos')) {
            url.searchParams.set('view', 'admin-projects');
        } else if (request.nextUrl.pathname.includes('/servicios')) {
            url.searchParams.set('view', 'admin-services');
        } else if (request.nextUrl.pathname.includes('/configuracion')) {
            url.searchParams.set('view', 'admin-config');
        } else if (request.nextUrl.pathname.includes('/equipo')) {
            url.searchParams.set('view', 'admin-team');
        } else if (request.nextUrl.pathname.includes('/usuarios')) {
            url.searchParams.set('view', 'admin-users');
        } else {
             // Default admin dashboard -> sistema dashboard (or admin-users if preferred, but dashboard is safer)
        }
        
        return NextResponse.redirect(url);
    }

    // Refresh session
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protect /admin and /sistema routes
    if (request.nextUrl.pathname.startsWith('/admin') || request.nextUrl.pathname.startsWith('/sistema')) {
        if (!user) {
            // Not logged in, redirect to login
            const url = request.nextUrl.clone();
            url.pathname = '/auth/login';
            url.searchParams.set('redirectTo', request.nextUrl.pathname);
            return NextResponse.redirect(url);
        }
    }

    return supabaseResponse;
}
