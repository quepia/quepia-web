export default function SistemaLoading() {
  return (
    <main className="min-h-screen bg-[#090909] p-6 text-white" aria-busy="true">
      <div className="mx-auto h-8 w-48 animate-pulse rounded-lg bg-white/[0.06]" />
      <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-2xl bg-white/[0.04]" />
        ))}
      </div>
    </main>
  )
}
