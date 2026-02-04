export default function Loading() {
    return (
        <div className="relative">
            {/* Hero Section Skeleton */}
            <section className="relative min-h-[60vh] flex items-center justify-center pt-20 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-cyan/5 via-transparent to-transparent" />
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-15"
                        style={{
                            background: 'radial-gradient(circle, rgba(42,231,228,0.18) 0%, rgba(136,16,120,0.12) 50%, transparent 70%)',
                            filter: 'blur(60px)',
                        }}
                    />
                </div>

                <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    <div className="h-3 w-28 bg-white/10 rounded-full mx-auto mb-6 animate-pulse" />
                    <div className="h-12 sm:h-14 md:h-16 w-[66%] mx-auto bg-white/10 rounded-lg animate-pulse" />
                    <div className="h-4 md:h-5 w-[52%] mx-auto bg-white/5 rounded-full mt-8 animate-pulse" />
                </div>
            </section>

            {/* Category Navigation Skeleton */}
            <div
                className="sticky top-16 md:top-[72px] z-40 py-4 border-y border-white/5 backdrop-blur-xl"
                style={{ background: 'rgba(10, 10, 10, 0.8)' }}
            >
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="flex gap-2 md:gap-3 overflow-x-auto py-1">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-9 w-28 rounded-full bg-white/10 animate-pulse"
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Gallery Skeleton */}
            <section className="py-16 md:py-24">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="mb-12 md:mb-16">
                        <div className="h-3 w-24 bg-white/10 rounded-full mb-4 animate-pulse" />
                        <div className="h-10 md:h-12 w-[38%] bg-white/10 rounded-lg animate-pulse" />
                    </div>

                    <div className="space-y-6 md:space-y-8">
                        <div className="aspect-[16/9] md:aspect-[21/9] rounded-xl bg-white/5 animate-pulse" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="aspect-[4/5] rounded-xl bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
