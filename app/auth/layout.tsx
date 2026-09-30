import type { Metadata } from 'next';

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

// A per-request CSP nonce cannot be reused by a prerendered login/MFA page.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
