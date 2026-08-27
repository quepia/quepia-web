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
import {
    isAuthorizedSistemaUser,
    type SistemaAccessProfile,
} from '@/lib/sistema/auth/authorization';

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

    // Refresh and verify the direct first-party session. Supabase OAuth access
    // tokens are valid user JWTs too, so privileged web/API routes must reject
    // any session that carries client_id even when getUser() succeeds.
    const { data: claimsData } = await supabase.auth.getClaims();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    const pathname = request.nextUrl.pathname;
    const isProtectedPath = isFirstPartyProtectedPath(pathname);

    const withSessionCookies = (response: NextResponse) => {
        supabaseResponse.cookies.getAll().forEach((cookie) => {
            response.cookies.set(cookie);
        });
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    };

    if (
        user &&
        isProtectedPath &&
        !isDirectFirstPartySessionClaims(claimsData?.claims)
    ) {
        return withSessionCookies(NextResponse.json(
            { error: 'OAuth client tokens are not valid web sessions' },
            {
                status: 403,
                headers: {
                    'Cache-Control': 'no-store',
                    'Referrer-Policy': 'no-referrer',
                    'X-Content-Type-Options': 'nosniff',
                },
            }
        ));
    }

    if (user && isProtectedPath) {
        const { data: accessProfile, error: accessError } = await supabase
            .from('sistema_users')
            .select('id, email, is_authorized, is_active, deleted_at')
            .eq('id', user.id)
            .maybeSingle();

        if (
            accessError ||
            !isAuthorizedSistemaUser(
                user,
                accessProfile as SistemaAccessProfile | null,
            )
        ) {
            if (pathname === '/api' || pathname.startsWith('/api/')) {
                return withSessionCookies(NextResponse.json(
                    { error: 'Forbidden: user is not authorized for Kepia' },
                    {
                        status: 403,
                        headers: {
                            'Referrer-Policy': 'no-referrer',
                            'X-Content-Type-Options': 'nosniff',
                        },
                    },
                ));
            }

            const url = request.nextUrl.clone();
            url.pathname = '/auth/access-denied';
            url.search = '';
            return withSessionCookies(NextResponse.redirect(url));
        }
    }

    // Protect /admin and /sistema routes
    if (pathname.startsWith('/admin') || pathname.startsWith('/sistema')) {
        if (!user) {
            // Not logged in, redirect to login
            const url = request.nextUrl.clone();
            url.pathname = '/auth/login';
            url.searchParams.set('redirectTo', request.nextUrl.pathname);
            return withSessionCookies(NextResponse.redirect(url));
        }
    }

    // Redirect legacy /admin URLs only after authentication and authorization
    // have both succeeded.
    if (pathname.startsWith('/admin')) {
        const url = request.nextUrl.clone();
        url.pathname = '/sistema';

        if (pathname.includes('/proyectos')) {
            url.searchParams.set('view', 'admin-projects');
        } else if (pathname.includes('/servicios')) {
            url.searchParams.set('view', 'admin-services');
        } else if (pathname.includes('/configuracion')) {
            url.searchParams.set('view', 'admin-config');
        } else if (pathname.includes('/equipo')) {
            url.searchParams.set('view', 'admin-team');
        } else if (pathname.includes('/usuarios')) {
            url.searchParams.set('view', 'admin-users');
        }

        return withSessionCookies(NextResponse.redirect(url));
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

    supabaseResponse.headers.set('Cache-Control', 'private, no-store');
    return supabaseResponse;
}
