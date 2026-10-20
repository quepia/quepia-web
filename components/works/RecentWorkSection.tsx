import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';

const recentWorks = [
  {
    id: 'bomberos-vcp',
    client: 'Bomberos de Villa Carlos Paz',
    title: 'El trabajo del cuartel, de cerca.',
    category: 'Cobertura institucional · Video',
    description: 'Producción y edición de un reel sobre un simulacro de incendio estructural.',
    shape: 'aspect-[9/16]',
  },
  {
    id: 'brandalise-flota',
    client: 'Grupo Brandalise',
    title: 'Una nueva flota, otra perspectiva.',
    category: 'Dron · Producción audiovisual',
    description: 'Presentación de nuevos vehículos con tomas aéreas y edición para redes.',
    shape: 'aspect-[9/16]',
  },
  {
    id: 'camping-la-ribera',
    client: 'Camping La Ribera',
    title: 'Contenido que invita a una escapada.',
    category: 'Turismo · Contenido para redes',
    description: 'Producción y edición de reels para comunicar la preventa de temporada del camping.',
    shape: 'aspect-[9/16]',
  },
  {
    id: 'nueva-generacion',
    client: 'Nueva Generación Turismo',
    title: 'Cada viaje tiene su historia.',
    category: 'Cobertura de viajes · Dron',
    description: 'Una mirada aérea al entorno de una de nuestras coberturas de turismo y viajes de egresados.',
    shape: 'aspect-video',
  },
];

export default function RecentWorkSection() {
  return (
    <section id="trabajos-recientes" aria-labelledby="recent-work-title" className="relative py-20 text-white md:py-28">
      <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-4 text-xs uppercase tracking-[0.24em] text-[#2ae7e4]">Últimos trabajos</p>
            <h2 id="recent-work-title" className="max-w-3xl font-display text-[clamp(2rem,4vw,3.5rem)] font-medium leading-[1.1] tracking-tight">
              Marcas y experiencias en movimiento.
            </h2>
          </div>
          <Link href="/contacto" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm transition-colors hover:border-[#2ae7e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2ae7e4]">
            Contanos tu próximo proyecto <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid items-start gap-6 md:grid-cols-2 xl:grid-cols-4">
          {recentWorks.map((work) => (
            <article key={work.id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
              <div className={`flex items-center bg-black ${work.shape}`}>
                <video
                  controls
                  playsInline
                  preload="none"
                  poster={`/trabajos-recientes/${work.id}.jpg`}
                  aria-label={`${work.client}: ${work.category}. Muestra visual sin audio.`}
                  className={`w-full ${work.shape} object-contain`}
                >
                  <source src={`/trabajos-recientes/${work.id}.mp4`} type="video/mp4" />
                  Tu navegador no permite reproducir este video.
                </video>
              </div>
              <div className="p-6">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#2ae7e4]">{work.category}</p>
                <p className="mt-4 text-sm text-white/60">{work.client}</p>
                <h3 className="mt-2 font-display text-2xl leading-tight">{work.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">{work.description}</p>
                <p className="mt-5 text-xs text-white/45">Muestra visual · Sin audio</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
            <Image src="/trabajos-recientes/drocha-1.webp" alt="Banner de D’Rocha Joyas: joyería, azul profundo y tipografía dorada" width={1580} height={600} sizes="(max-width: 1024px) 100vw, 33vw" className="h-auto w-full" />
            <div className="p-6">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#2ae7e4]">Identidad visual · Diseño para web</p>
              <h3 className="mt-4 font-display text-2xl">D’Rocha Joyas</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">Banners para web que combinan joyería, texturas y una línea visual en azul y dorado.</p>
              <details className="group mt-5">
                <summary className="cursor-pointer rounded-lg py-3 text-sm text-white/80 transition-colors hover:text-[#2ae7e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2ae7e4]">Ver más piezas de D’Rocha</summary>
                <div className="mt-4 space-y-4">
                  {[2, 3, 4].map((number) => (
                    <Image key={number} src={`/trabajos-recientes/drocha-${number}.webp`} alt={`D’Rocha Joyas: banner para web, pieza ${number}`} width={1580} height={600} sizes="(max-width: 1024px) 100vw, 33vw" className="h-auto w-full rounded-xl" />
                  ))}
                </div>
              </details>
            </div>
          </article>
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
            <div className="grid grid-cols-3 gap-1 bg-black">
              {['01', '03', '06'].map((number) => (
                <Image key={number} src={`/trabajos-recientes/bomberos-redes-${number}.webp`} alt={`Bomberos de Villa Carlos Paz: carrusel de prevención ante tormentas, pieza ${number}`} width={800} height={1067} sizes="(max-width: 1024px) 33vw, 11vw" className="h-auto w-full" />
              ))}
            </div>
            <div className="p-6">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#2ae7e4]">Diseño gráfico · Comunicación institucional</p>
              <h3 className="mt-4 font-display text-2xl">Bomberos de Villa Carlos Paz</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">Diseño de piezas para redes que hacen visibles los mensajes de prevención y acompañan la comunicación del cuartel.</p>
            </div>
          </article>
          <article className="overflow-hidden rounded-3xl border border-white/10 bg-[#101010]">
            <Image src="/trabajos-recientes/la-fuga-identidad.webp" alt="Identidad visual de La Fuga: logotipo blanco sobre formas azules y fucsias" width={1100} height={619} sizes="(max-width: 1024px) 100vw, 33vw" className="h-auto w-full" />
            <div className="p-6">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#2ae7e4]">Identidad visual · Cartelería</p>
              <h3 className="mt-4 font-display text-2xl">La Fuga</h3>
              <p className="mt-3 text-sm leading-relaxed text-[#a1a1aa]">Identidad para una marca de artículos de limpieza: logotipo, paleta de colores y aplicaciones gráficas para el local.</p>
              <details className="group mt-5">
                <summary className="cursor-pointer rounded-lg py-3 text-sm text-white/80 transition-colors hover:text-[#2ae7e4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2ae7e4]">Ver identidad y cartelería de La Fuga</summary>
                <div className="mt-4 space-y-4">
                  <Image src="/trabajos-recientes/la-fuga-paleta.webp" alt="La Fuga: variantes del logotipo y paleta de colores azul y fucsia del manual de marca" width={1100} height={619} sizes="(max-width: 1024px) 100vw, 33vw" className="h-auto w-full rounded-xl" />
                  <Image src="/trabajos-recientes/la-fuga-carteleria.webp" alt="Diseño de cartel de La Fuga con las categorías cloro, limpieza y mascotas" width={577} height={1600} sizes="(max-width: 1024px) 100vw, 33vw" className="h-auto w-full rounded-xl" />
                </div>
              </details>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
