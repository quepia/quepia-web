'use client'

import { startTransition, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence, useInView } from 'framer-motion'
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { CATEGORIES, Proyecto, WorkCategory } from '@/types/database'
import { getProjectCoverImage, getProjectGalleryImages } from '@/lib/project-images'
import BrandDepthBackground from '@/components/ui/BrandDepthBackground'
import MarqueeSection from '@/components/home/MarqueeSection'

interface WorksClientProps {
  proyectos: Proyecto[]
  initialCategory: WorkCategory
}

const CATEGORY_LABELS = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.label]))

const CATEGORY_ACCENTS: Record<string, string> = {
  branding: 'from-fuchsia-400/30 to-orange-300/20',
  'diseno-grafico': 'from-cyan-400/30 to-blue-400/20',
  fotografia: 'from-emerald-300/30 to-cyan-300/20',
  video: 'from-rose-300/30 to-fuchsia-300/20',
  'redes-sociales': 'from-orange-300/30 to-rose-300/20',
  packaging: 'from-lime-300/30 to-amber-300/20',
  carteleria: 'from-sky-300/30 to-indigo-300/20',
  marketing: 'from-red-300/30 to-orange-300/20',
  productos: 'from-violet-300/30 to-fuchsia-300/20',
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS.get(category) ?? category.replace(/-/g, ' ')
}

function categoryAccentClass(category: string): string {
  return CATEGORY_ACCENTS[category] ?? 'from-cyan-300/30 to-zinc-300/20'
}

function LeadProject({
  proyecto,
  onOpen,
}: {
  proyecto: Proyecto
  onOpen: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const coverImage = getProjectCoverImage(proyecto)
  const galleryCount = getProjectGalleryImages(proyecto).length

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 28 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="group w-full overflow-hidden rounded-[26px] border border-white/[0.06] bg-[#070707]/90 text-left"
    >
      <div className="grid gap-0 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="relative min-h-[300px] overflow-hidden sm:min-h-[420px] lg:min-h-[500px]">
          {coverImage ? (
            <Image
              src={coverImage}
              alt={proyecto.titulo}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              sizes="(max-width: 1024px) 100vw, 65vw"
            />
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${categoryAccentClass(proyecto.categoria)}`} />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.1)_0%,rgba(0,0,0,0.7)_100%)]" />

          <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/75">
            {categoryLabel(proyecto.categoria)}
          </div>

          {galleryCount > 1 ? (
            <div className="absolute bottom-4 right-4 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/75">
              {galleryCount} fotos
            </div>
          ) : null}
        </div>

        <div className="relative flex flex-col justify-between border-t border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.2))] p-6 md:p-8 lg:border-l lg:border-t-0">
          <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-25 ${categoryAccentClass(proyecto.categoria)}`} />
          <div className="relative">
            <p className="mb-3 text-xs uppercase tracking-[0.2em] text-white/45">Proyecto destacado</p>
            <h3 className="font-display text-[clamp(1.55rem,3vw,2.4rem)] font-medium leading-[1.02] text-white">
              {proyecto.titulo}
            </h3>

            <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/25 p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Descripción</p>
              <p className="mt-2 text-sm leading-relaxed text-[#9ea0a8]">
                {proyecto.descripcion || 'Este proyecto todavía no tiene descripción detallada.'}
              </p>
            </div>
          </div>

          <div className="relative mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/60 transition-colors duration-300 group-hover:text-white/85">
            Ver proyecto completo
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </motion.button>
  )
}

function ProjectCard({
  proyecto,
  index,
  onOpen,
}: {
  proyecto: Proyecto
  index: number
  onOpen: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-60px' })
  const coverImage = getProjectCoverImage(proyecto)
  const galleryCount = getProjectGalleryImages(proyecto).length

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-white/[0.06] bg-[#070707]/90 text-left transition-all duration-300 hover:border-white/[0.1]"
    >
      <div className="relative aspect-[16/11] overflow-hidden">
        {coverImage ? (
          <Image
            src={coverImage}
            alt={proyecto.titulo}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            sizes="(max-width: 768px) 100vw, (max-width: 1440px) 50vw, 33vw"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${categoryAccentClass(proyecto.categoria)}`} />
        )}

        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.08)_0%,rgba(0,0,0,0.68)_100%)]" />

        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/75">
          {categoryLabel(proyecto.categoria)}
        </div>

        {galleryCount > 1 ? (
          <div className="absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/75">
            {galleryCount} fotos
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h4 className="font-display text-[1.3rem] leading-tight text-white">{proyecto.titulo}</h4>

        <div className="mt-3 min-h-[96px] rounded-xl border border-white/[0.08] bg-black/25 p-3">
          <p className="line-clamp-4 text-sm leading-relaxed text-[#9ea0a8]">
            {proyecto.descripcion || 'Este proyecto todavía no tiene descripción.'}
          </p>
        </div>

        <div className="mt-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-white/55 transition-colors duration-300 group-hover:text-white/80">
          Ver detalle <ArrowUpRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </motion.button>
  )
}

function Lightbox({
  proyecto,
  onClose,
}: {
  proyecto: Proyecto
  onClose: () => void
}) {
  const images = useMemo(() => getProjectGalleryImages(proyecto), [proyecto])
  const [activeIndex, setActiveIndex] = useState(0)
  const hasMultipleImages = images.length > 1
  const activeImage = images[activeIndex] ?? null

  useEffect(() => {
    setActiveIndex(0)
  }, [proyecto.id])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (!hasMultipleImages) return
      if (event.key === 'ArrowLeft') {
        setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1))
      }
      if (event.key === 'ArrowRight') {
        setActiveIndex((current) => (current + 1) % images.length)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasMultipleImages, images.length, onClose])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/20 bg-black/55 p-3 text-white/80 transition-colors hover:text-white md:right-7 md:top-7"
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>

      <div className="mx-auto grid h-full w-full max-w-[1500px] items-center gap-4 p-4 md:grid-cols-[1.5fr_0.8fr] md:gap-6 md:p-7">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.28 }}
          className="relative flex h-[54vh] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101318] md:h-[78vh]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="relative flex-1">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={`${proyecto.titulo} (${activeIndex + 1}/${images.length})`}
                fill
                className="object-contain"
                sizes="80vw"
              />
            ) : (
              <div className={`absolute inset-0 bg-gradient-to-br ${categoryAccentClass(proyecto.categoria)}`} />
            )}

            {hasMultipleImages ? (
              <>
                <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/80">
                  {activeIndex + 1} / {images.length}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1))}
                  className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2.5 text-white/80 transition-colors hover:text-white"
                  aria-label="Imagen anterior"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (current + 1) % images.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/60 p-2.5 text-white/80 transition-colors hover:text-white"
                  aria-label="Siguiente imagen"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            ) : null}
          </div>

          {hasMultipleImages ? (
            <div className="border-t border-white/10 bg-black/45 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((imageUrl, index) => (
                  <button
                    type="button"
                    key={`${imageUrl}-${index}`}
                    onClick={() => setActiveIndex(index)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border transition-colors ${
                      index === activeIndex ? 'border-white/50' : 'border-white/15 hover:border-white/30'
                    }`}
                    aria-label={`Ver imagen ${index + 1}`}
                  >
                    <Image src={imageUrl} alt={`${proyecto.titulo} miniatura ${index + 1}`} fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.32, delay: 0.05 }}
          className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-black/35 p-5 md:p-7"
          onClick={(event) => event.stopPropagation()}
        >
          <span className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/70">
            {categoryLabel(proyecto.categoria)}
          </span>
          <h3 className="mt-4 font-display text-2xl md:text-3xl font-light leading-tight text-white">{proyecto.titulo}</h3>
          <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Descripción del proyecto</p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">
              {proyecto.descripcion || 'Este proyecto aún no tiene una descripción cargada.'}
            </p>
          </div>
          <Link
            href="/contacto"
            className="mt-6 inline-flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-white/65 transition-colors hover:text-white"
          >
            Quiero un proyecto así
            <ArrowRight size={14} />
          </Link>
        </motion.aside>
      </div>
    </motion.div>
  )
}

export default function WorksPage({ proyectos, initialCategory }: WorksClientProps) {
  const [activeCategory, setActiveCategory] = useState<WorkCategory>(initialCategory)
  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const inView = useInView(heroRef, { once: true })
  const filteredProjects = useMemo(
    () => proyectos.filter((proyecto) => proyecto.categoria === activeCategory),
    [activeCategory, proyectos]
  )

  useEffect(() => {
    setActiveCategory(initialCategory)
  }, [initialCategory])

  useEffect(() => {
    if (!selectedProject || selectedProject.categoria === activeCategory) return
    setSelectedProject(null)
  }, [activeCategory, selectedProject])

  const leadProject = filteredProjects[0] ?? null
  const otherProjects = useMemo(() => filteredProjects.slice(1), [filteredProjects])

  const handleCategoryChange = (category: WorkCategory) => {
    if (category === activeCategory) return

    startTransition(() => {
      setActiveCategory(category)
    })

    const params = new URLSearchParams(window.location.search)
    params.set('category', category)
    const nextQuery = params.toString()
    const nextUrl = nextQuery ? `${window.location.pathname}?${nextQuery}` : window.location.pathname
    window.history.replaceState(window.history.state, '', nextUrl)
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
      <BrandDepthBackground variant="subtle" />
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(180deg,#0a0a0a_0%,#101010_42%,#0d0d0d_100%)]" />

      <div className="relative z-10">
        <section ref={heroRef} className="relative overflow-hidden pb-14 pt-28 md:pb-20 md:pt-32">
          <div className="pointer-events-none absolute left-1/2 top-0 z-0 h-screen w-screen -translate-x-1/2">
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full scale-[1.38] object-cover object-center opacity-[0.14]"
              src={encodeURI('/VIDEOS CARDS/ANIMACIONES QUEPIA.mp4')}
            />
            <div className="absolute inset-0 bg-[linear-gradient(95deg,rgba(10,10,10,0.95)_0%,rgba(10,10,10,0.82)_48%,rgba(10,10,10,0.9)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(42,231,228,0.08),transparent_45%)]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-3xl"
            >
              <p className="mb-5 text-xs uppercase tracking-[0.24em] text-white/48">Portfolio</p>

              <h1 className="font-display text-[clamp(1.9rem,3.9vw,3.45rem)] font-medium leading-[1.06] tracking-[-0.02em] text-white">
                Nuestros trabajos por categoría, con foco en resultados reales.
              </h1>

              <p className="mt-5 max-w-2xl text-[0.98rem] leading-relaxed text-[#a1a1aa] md:text-[1.05rem]">
                Explorá casos reales de branding, diseño y estrategia aplicados a desafíos concretos.
              </p>

              <div className="mt-8 grid max-w-[560px] grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Categoría activa</p>
                  <p className="mt-1 text-sm text-white/85">{categoryLabel(activeCategory)}</p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Proyectos</p>
                  <p className="mt-1 text-sm text-white/85">{filteredProjects.length}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <MarqueeSection />

        <div className="sticky top-16 z-40 border-y border-white/[0.08] bg-[#07090d]/82 py-4 backdrop-blur-xl md:top-[72px]">
          <div className="mx-auto w-full max-w-[1400px] px-6 md:px-12 lg:px-20">
            <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-1">
              {CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => handleCategoryChange(category.id)}
                  aria-pressed={activeCategory === category.id}
                  className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.07em] transition-colors ${
                    activeCategory === category.id
                      ? 'border-[#2ae7e4]/35 bg-[#2ae7e4] text-[#0a0a0a]'
                      : 'border-white/10 bg-black/35 text-white/60 hover:border-white/20 hover:text-white/85'
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="py-12 md:py-16">
          <div className="mx-auto w-full max-w-[1400px] space-y-6 px-6 md:space-y-8 md:px-12 lg:px-20">
            {filteredProjects.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-2xl border border-dashed border-white/15 bg-black/25 px-6 py-16 text-center"
              >
                <p className="text-lg text-white/60">No hay proyectos en esta categoría todavía.</p>
                <Link href="/contacto" className="mt-4 inline-flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-white/70 hover:text-white">
                  Contactanos para tu proyecto
                  <ArrowRight size={14} />
                </Link>
              </motion.div>
            ) : (
              <>
                {leadProject ? <LeadProject proyecto={leadProject} onOpen={() => setSelectedProject(leadProject)} /> : null}

                {otherProjects.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {otherProjects.map((proyecto, index) => (
                      <ProjectCard
                        key={proyecto.id}
                        proyecto={proyecto}
                        index={index}
                        onOpen={() => setSelectedProject(proyecto)}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section className="relative overflow-hidden py-20 md:py-24">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-[12%] top-[-34%] h-[30rem] w-[30rem] rounded-full bg-[#9b2c8a]/26 blur-[140px]" />
            <div className="absolute -right-[12%] bottom-[-36%] h-[30rem] w-[30rem] rounded-full bg-[#2ae7e4]/22 blur-[140px]" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative mx-auto w-full max-w-[980px] px-6 text-center md:px-12 lg:px-20"
          >
            <div className="rounded-[24px] border border-white/[0.07] bg-white/[0.03] px-6 py-12 backdrop-blur-[12px] md:px-12">
              <h2 className="mx-auto max-w-2xl font-display text-[clamp(1.6rem,3vw,2.4rem)] font-medium leading-[1.1] text-white">
                ¿Querés un proyecto así para tu marca?
              </h2>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#a1a1aa] md:text-base">
                Te ayudamos a pasar de una idea a una solución visual sólida, ejecutable y orientada a resultados.
              </p>

              <Link
                href="/contacto"
                className="mt-8 inline-flex items-center gap-2 text-sm uppercase tracking-[0.1em] text-white/68 transition-all duration-300 hover:gap-3 hover:text-white"
              >
                Hablemos de tu proyecto
                <ArrowRight size={14} />
              </Link>
            </div>
          </motion.div>
        </section>
      </div>

      <AnimatePresence>
        {selectedProject ? <Lightbox proyecto={selectedProject} onClose={() => setSelectedProject(null)} /> : null}
      </AnimatePresence>
    </main>
  )
}
