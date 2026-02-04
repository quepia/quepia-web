export default function Loading() {
    return (
        <div className="relative">
            {/* Hero Section Skeleton */}
            <section className="relative min-h-[70vh] flex items-center justify-center pt-20 overflow-hidden">
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-0 bg-gradient-to-b from-quepia-purple/5 via-transparent to-transparent" />
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-15"
                        style={{
                            background: 'radial-gradient(circle, rgba(42,231,228,0.12) 0%, rgba(136,16,120,0.12) 50%, transparent 70%)',
                            filter: 'blur(60px)',
                        }}
                    />
                </div>

                <div className="relative z-10 max-w-[1200px] mx-auto px-6 md:px-12 lg:px-20 text-center">
                    <div className="h-3 w-36 bg-white/10 rounded-full mx-auto mb-6 animate-pulse" />
                    <div className="space-y-3">
                        <div className="h-10 sm:h-12 md:h-14 w-[72%] mx-auto bg-white/10 rounded-lg animate-pulse" />
                        <div className="h-10 sm:h-12 md:h-14 w-[64%] mx-auto bg-white/10 rounded-lg animate-pulse" />
                    </div>
                    <div className="h-4 md:h-5 w-[58%] mx-auto bg-white/5 rounded-full mt-8 animate-pulse" />
                </div>
            </section>

            {/* Services Grid Skeleton */}
            <section className="py-16 md:py-24">
                <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-20">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className={`glass-card p-6 md:p-8 animate-pulse ${i === 0 ? 'md:col-span-2 md:row-span-2' : ''}`}
                            >
                                <div className="flex flex-col h-full">
                                    <div className={`rounded-xl bg-white/10 mb-6 ${i === 0 ? 'w-16 h-16' : 'w-12 h-12'}`} />
                                    <div className="h-6 bg-white/10 rounded w-3/4 mb-3" />
                                    <div className="h-4 bg-white/5 rounded w-full mb-2" />
                                    <div className="h-4 bg-white/5 rounded w-5/6" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
