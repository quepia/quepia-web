import Image from 'next/image';
import { socialProof } from '@/lib/seo/social-proof';
export default function SocialProof() {
  if (!socialProof.testimonials.length && !socialProof.logos.length) return null;
  return <section className="mx-auto max-w-[1200px] px-6 py-12 text-white"><h2 className="mb-6 font-display text-2xl">Marcas que trabajan con Quepia</h2><div className="flex flex-wrap gap-8">{socialProof.logos.map(logo => <Image key={logo.name} src={logo.src} alt={`Logo de ${logo.name}, cliente de Quepia`} width={160} height={80} className="object-contain" />)}</div><div className="mt-8 grid gap-6 md:grid-cols-2">{socialProof.testimonials.map(item => <figure key={`${item.name}-${item.quote}`} className="rounded-2xl border border-white/10 p-6"><blockquote>{item.quote}</blockquote><figcaption className="mt-4 text-white/60">{item.name}{item.role ? ` · ${item.role}` : ''}</figcaption></figure>)}</div></section>;
}
