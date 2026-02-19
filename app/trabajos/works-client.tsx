"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, X, Sparkles } from "lucide-react"
import { CATEGORIES, Proyecto } from "@/types/database"
import { getProjectCoverImage, getProjectGalleryImages } from "@/lib/project-images"

interface WorksClientProps {
  proyectos: Proyecto[]
  activeCategory: string
}

const CATEGORY_LABELS = new Map<string, string>(CATEGORIES.map((category) => [category.id, category.label]))

const CATEGORY_ACCENTS: Record<string, string> = {
  branding: "from-fuchsia-400/30 to-orange-300/20",
  "diseno-grafico": "from-cyan-400/30 to-blue-400/20",
  fotografia: "from-emerald-300/30 to-cyan-300/20",
  video: "from-rose-300/30 to-fuchsia-300/20",
  "redes-sociales": "from-orange-300/30 to-rose-300/20",
  packaging: "from-lime-300/30 to-amber-300/20",
  carteleria: "from-sky-300/30 to-indigo-300/20",
  marketing: "from-red-300/30 to-orange-300/20",
  productos: "from-violet-300/30 to-fuchsia-300/20",
}

function categoryLabel(category: string): string {
  return CATEGORY_LABELS.get(category) ?? category.replace(/-/g, " ")
}

function categoryAccentClass(category: string): string {
  return CATEGORY_ACCENTS[category] ?? "from-cyan-300/30 to-white/10"
}

function LeadProject({
  proyecto,
  onOpen,
}: {
  proyecto: Proyecto
  onOpen: () => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-100px" })
  const coverImage = getProjectCoverImage(proyecto)
  const galleryCount = getProjectGalleryImages(proyecto).length

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black/30 text-left"
    >
      <div className="grid gap-0 lg:grid-cols-[1.25fr_0.9fr]">
        <div className="relative min-h-[300px] sm:min-h-[420px] lg:min-h-[520px]">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/5" />
          <div className="absolute left-5 top-5 rounded-full border border-white/20 bg-black/45 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-white/75">
            {categoryLabel(proyecto.categoria)}
          </div>
          {galleryCount > 1 && (
            <div className="absolute bottom-5 right-5 rounded-full border border-white/15 bg-black/50 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/80">
              {galleryCount} fotos
            </div>
          )}
        </div>

        <div className="relative flex flex-col justify-between border-t border-white/10 bg-gradient-to-b from-white/[0.08] to-black/35 p-5 sm:p-8 lg:border-l lg:border-t-0">
          <div className={`absolute inset-0 bg-gradient-to-br opacity-35 ${categoryAccentClass(proyecto.categoria)}`} />
          <div className="relative">
            <p className="mb-3 text-xs uppercase tracking-[0.18em] text-white/50">Proyecto destacado</p>
            <h3 className="font-display text-3xl sm:text-4xl lg:text-5xl font-light leading-[0.95] text-white">
              {proyecto.titulo}
            </h3>
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Descripción</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {proyecto.descripcion || "Este proyecto todavía no tiene descripción detallada."}
              </p>
            </div>
          </div>
          <div className="relative mt-6 inline-flex items-center gap-2 text-sm uppercase tracking-[0.14em] text-white/70">
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
  const isInView = useInView(ref, { once: true, margin: "-60px" })
  const coverImage = getProjectCoverImage(proyecto)
  const galleryCount = getProjectGalleryImages(proyecto).length

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.03, 0.2), ease: [0.16, 1, 0.3, 1] }}
      onClick={onOpen}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left transition-colors hover:border-white/20"
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
        <div className="absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/75">
          {categoryLabel(proyecto.categoria)}
        </div>
        {galleryCount > 1 && (
          <div className="absolute bottom-3 right-3 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/80">
            {galleryCount} fotos
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <h4 className="font-display text-xl font-light leading-tight text-white">{proyecto.titulo}</h4>
        <div className="mt-3 min-h-[96px] rounded-xl border border-white/10 bg-black/25 p-3">
          <p className="line-clamp-4 text-sm leading-relaxed text-white/70">
            {proyecto.descripcion || "Este proyecto todavía no tiene descripción."}
          </p>
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-white/55">
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
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (!hasMultipleImages) return
      if (event.key === "ArrowLeft") {
        setActiveIndex((current) => (current === 0 ? images.length - 1 : current - 1))
      }
      if (event.key === "ArrowRight") {
        setActiveIndex((current) => (current + 1) % images.length)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
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

            {hasMultipleImages && (
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
            )}
          </div>

          {hasMultipleImages && (
            <div className="border-t border-white/10 bg-black/45 p-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((imageUrl, index) => (
                  <button
                    type="button"
                    key={`${imageUrl}-${index}`}
                    onClick={() => setActiveIndex(index)}
                    className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border transition-colors ${
                      index === activeIndex ? "border-white/50" : "border-white/15 hover:border-white/30"
                    }`}
                    aria-label={`Ver imagen ${index + 1}`}
                  >
                    <Image src={imageUrl} alt={`${proyecto.titulo} miniatura ${index + 1}`} fill className="object-cover" sizes="64px" />
                  </button>
                ))}
              </div>
            </div>
          )}
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
              {proyecto.descripcion || "Este proyecto aún no tiene una descripción cargada."}
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

export default function WorksPage({ proyectos, activeCategory }: WorksClientProps) {
  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const inView = useInView(heroRef, { once: true })

  const leadProject = proyectos[0] ?? null
  const otherProjects = useMemo(() => proyectos.slice(1), [proyectos])

  return (
    <div className="relative overflow-hidden bg-[#06080b]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)" }} />
        <div className="absolute left-[-120px] top-20 h-[500px] w-[500px] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-[-180px] right-[-120px] h-[500px] w-[500px] rounded-full bg-fuchsia-400/10 blur-3xl" />
      </div>

      <section ref={heroRef} className="relative border-b border-white/10 pt-28 md:pt-32">
        <div className="mx-auto max-w-[1500px] px-6 pb-14 md:px-12 lg:px-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs uppercase tracking-[0.18em] text-white/65"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            Portfolio Quepia
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="mt-5 font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-light tracking-tight text-white"
          >
            Nuestros trabajos
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.65, delay: 0.2 }}
            className="mt-5 max-w-[720px] text-lg leading-relaxed text-white/60"
          >
            Catálogo curado de proyectos reales, organizado por categoría y con descripción de cada caso para entender qué resolvimos y cómo lo hicimos.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.65, delay: 0.28 }}
            className="mt-8 grid max-w-[560px] grid-cols-2 gap-3"
          >
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Categoría activa</p>
              <p className="mt-1 text-sm text-white/85">{categoryLabel(activeCategory)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">Proyectos</p>
              <p className="mt-1 text-sm text-white/85">{proyectos.length}</p>
            </div>
          </motion.div>
        </div>
      </section>

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="sticky top-16 z-40 border-y border-white/10 bg-[#07090d]/80 py-4 backdrop-blur-xl md:top-[72px]"
      >
        <div className="mx-auto max-w-[1500px] px-6 md:px-12 lg:px-20">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((category) => (
              <Link
                key={category.id}
                href={`/trabajos?category=${category.id}`}
                className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  activeCategory === category.id
                    ? "border-white/30 bg-white text-black"
                    : "border-white/10 bg-black/35 text-white/60 hover:text-white"
                }`}
              >
                {category.label}
              </Link>
            ))}
          </div>
        </div>
      </motion.div>

      <section className="relative py-12 md:py-16">
        <div className="mx-auto max-w-[1500px] space-y-6 px-6 md:space-y-8 md:px-12 lg:px-20">
          {proyectos.length === 0 ? (
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
              {leadProject && <LeadProject proyecto={leadProject} onOpen={() => setSelectedProject(leadProject)} />}

              {otherProjects.length > 0 && (
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
              )}
            </>
          )}
        </div>
      </section>

      <section className="relative border-t border-white/10 py-20 md:py-28">
        <div className="mx-auto max-w-[1100px] px-6 text-center md:px-12 lg:px-20">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="font-display text-4xl md:text-5xl font-light text-white"
          >
            ¿Querés un proyecto así?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="mx-auto mt-5 max-w-[620px] text-white/60"
          >
            Te ayudamos a traducir una idea en una propuesta visual sólida, ejecutable y con resultados medibles.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mt-9"
          >
            <Link
              href="/contacto"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-6 py-3 text-sm uppercase tracking-[0.16em] text-white/80 transition-colors hover:bg-white hover:text-black"
            >
              Hablemos de tu proyecto
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>
      </section>

      <AnimatePresence>
        {selectedProject && <Lightbox proyecto={selectedProject} onClose={() => setSelectedProject(null)} />}
      </AnimatePresence>
    </div>
  )
}
