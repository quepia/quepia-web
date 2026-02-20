import type { Metadata } from 'next';

export const metadata: Metadata = {
    robots: { index: false, follow: false },
};

export default function ReviewLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white selection:bg-quepia-cyan/30">
            {children}
        </div>
    )
}
