import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isNonceProtectedPage, privateContentSecurityPolicy } from '@/lib/security/csp';

export async function middleware(request: NextRequest) {
    // Overwrite untrusted incoming nonce/CSP headers before passing to Next.
    request.headers.delete('x-nonce');
    request.headers.delete('content-security-policy');
    const csp = isNonceProtectedPage(request.nextUrl.pathname)
        ? privateContentSecurityPolicy(btoa(crypto.randomUUID()), process.env.NODE_ENV !== 'production')
        : null;
    if (csp) request.headers.set('Content-Security-Policy', csp);
    const response = await updateSession(request);
    if (csp) {
        response.headers.set('Content-Security-Policy', csp);
        response.headers.set('Cache-Control', 'private, no-store');
    }
    return response;
}

export const config = {
    matcher: [
        // Protected endpoints must retain session/MFA checks even when an ID
        // happens to end with a public asset extension.
        '/api/:path*',
        '/sistema/:path*',
        '/admin/:path*',
        '/auth/:path*',
        '/oauth/:path*',
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public media, fonts, and WebAssembly assets
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|mp4|webm|mov|mp3|wav|ogg|woff|woff2|ttf|otf|wasm)$).*)',
    ],
};
