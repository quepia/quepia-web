export default function Loading() {
    return (
        <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a]">
            <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_42%,#0d0d0d_100%)]" />

            <div className="relative z-10">
                <section className="relative min-h-[56vh] overflow-hidden pb-14 pt-28 md:pb-20 md:pt-32">
                    <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
                        <div className="h-3 w-28 rounded-full bg-white/10 animate-pulse mb-6" />
                        <div className="h-12 sm:h-14 md:h-16 w-[66%] rounded-lg bg-white/10 animate-pulse" />
                        <div className="h-4 md:h-5 w-[52%] rounded-full bg-white/5 animate-pulse mt-8" />
                    </div>
                </section>

                <div className="sticky top-16 md:top-[72px] z-40 py-4 border-y border-white/[0.08] backdrop-blur-xl bg-[#07090d]/82">
                    <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
                        <div className="flex gap-2 overflow-x-auto py-1">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-9 w-28 rounded-full bg-white/10 animate-pulse" />
                            ))}
                        </div>
                    </div>
                </div>

                <section className="py-12 md:py-16">
                    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-6 md:space-y-8 md:px-12 lg:px-20">
                        <div className="aspect-[16/9] md:aspect-[21/9] rounded-[26px] bg-white/5 animate-pulse" />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="aspect-[16/11] rounded-[24px] bg-white/5 animate-pulse" />
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
