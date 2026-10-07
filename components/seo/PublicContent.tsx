import Link from 'next/link';
import Image from 'next/image';
import JsonLd, { breadcrumbs } from './JsonLd';
import { projectSlug } from '@/lib/seo/projects-slug';
import type { PublicProject } from '@/lib/seo/projects';
import { getProjectCoverImage } from '@/lib/project-images';
import { getProjectCategoryLabels } from '@/lib/project-categories';
import { whatsappUrl } from '@/lib/contact';
export { whatsappUrl } from '@/lib/contact';
export function PublicShell({ title, intro, path, children }: { title: string; intro?: string; path: string; children: React.ReactNode }) {
  return <section className="mx-auto max-w-[1200px] px-6 pb-28 pt-28 text-white md:px-12">
    <JsonLd data={breadcrumbs([{ name: title, path }])} />
    <nav aria-label="Ruta de navegación" className="mb-8 text-sm text-white/60"><Link href="/">Inicio</Link> / <span>{title}</span></nav>
    <h1 className="font-display text-[clamp(2rem,5vw,3.7rem)] leading-tight">{title}</h1>
    {intro && <p className="mt-6 max-w-3xl text-lg leading-relaxed text-[#a1a1aa]">{intro}</p>}
    <div className="mt-12 space-y-12">{children}</div>
  </section>;
}
export function ContentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="max-w-3xl"><h2 className="mb-4 font-display text-2xl text-white">{title}</h2><div className="leading-relaxed text-[#a1a1aa]">{children}</div></section>;
}
export function ContactCta({ service }: { service?: string }) {
  return <div className="flex flex-wrap gap-5"><a data-service={service} href={whatsappUrl(service)} className="rounded-full bg-[#2ae7e4] px-6 py-3 font-medium text-black">Consultá por WhatsApp</a><Link href={`/contacto${service ? `?servicio=${encodeURIComponent(service)}` : ''}`} className="rounded-full border border-white/20 px-6 py-3">Contanos tu proyecto</Link></div>;
}
export function ProjectCards({ projects }: { projects: PublicProject[] }) {
  return <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{projects.map(project => {
    const cover = getProjectCoverImage(project);
    return <Link key={project.id} href={`/trabajos/${projectSlug(project)}`} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
      {cover && <div className="relative aspect-[4/3]"><Image src={cover} alt={`${project.titulo}: ${getProjectCategoryLabels(project).join(', ')}${project.ciudad ? ` en ${project.ciudad}` : ''}`} fill sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 350px" className="object-cover" /></div>}
      <div className="p-6"><h3 className="font-display text-xl">{project.titulo}</h3><p className="mt-3 text-sm text-white/60">Ver caso completo →</p></div>
    </Link>;
  })}</div>;
}
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  return <section><JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: items.map(item => ({ '@type': 'Question', name: item.q, acceptedAnswer: { '@type': 'Answer', text: item.a } })) }} /><h2 className="mb-6 font-display text-2xl">Preguntas frecuentes</h2><div className="max-w-3xl space-y-4">{items.map(item => <details key={item.q} className="rounded-2xl border border-white/10 p-5"><summary className="cursor-pointer font-medium">{item.q}</summary><p className="mt-4 leading-relaxed text-[#a1a1aa]">{item.a}</p></details>)}</div></section>;
}
