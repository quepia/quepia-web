import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
    isDirectFirstPartySessionClaims,
    isFirstPartyProtectedPath,
} from '@/lib/mcp/session-boundary';
import {
    isOAuthCsrfCookieSecret,
    MCP_OAUTH_CSRF_COOKIE_MAX_AGE_SECONDS,
    MCP_OAUTH_CSRF_COOKIE_NAME,
} from '@/lib/mcp/oauth-csrf-cookie';

export async function updateSession(request: NextRequest) {
    const shouldIssueOAuthCsrfCookie =
        request.method === 'GET' &&
        request.nextUrl.pathname === '/oauth/consent' &&
        !isOAuthCsrfCookieSecret(
            request.cookies.get(MCP_OAUTH_CSRF_COOKIE_NAME)?.value
        );
    const oauthCsrfCookieSecret = shouldIssueOAuthCsrfCookie
        ? crypto.randomUUID()
        : null;
    if (oauthCsrfCookieSecret) {
        request.cookies.set(
            MCP_OAUTH_CSRF_COOKIE_NAME,
            oauthCsrfCookieSecret
        );
    }

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

    // Refresh and verify the direct first-party session. Supabase OAuth access
    // tokens are valid user JWTs too, so privileged web/API routes must reject
    // any session that carries client_id even when getUser() succeeds.
    const { data: claimsData } = await supabase.auth.getClaims();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (
        user &&
        isFirstPartyProtectedPath(request.nextUrl.pathname) &&
        !isDirectFirstPartySessionClaims(claimsData?.claims)
    ) {
        return NextResponse.json(
            { error: 'OAuth client tokens are not valid web sessions' },
            {
                status: 403,
                headers: {
                    'Cache-Control': 'no-store',
                    'Referrer-Policy': 'no-referrer',
                    'X-Content-Type-Options': 'nosniff',
                },
            }
        );
    }

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

    if (oauthCsrfCookieSecret) {
        supabaseResponse.cookies.set(
            MCP_OAUTH_CSRF_COOKIE_NAME,
            oauthCsrfCookieSecret,
            {
                httpOnly: true,
                maxAge: MCP_OAUTH_CSRF_COOKIE_MAX_AGE_SECONDS,
                path: '/',
                sameSite: 'lax',
                secure: process.env.NODE_ENV === 'production',
            }
        );
    }

    return supabaseResponse;
}
