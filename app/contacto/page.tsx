import Link from 'next/link';
import { ArrowRight, Mail, MapPin, Instagram, Clock, Phone } from 'lucide-react';
import Button from '@/components/ui/Button';
import { getSiteConfigServer } from '@/lib/fetchConfigServer';

export default async function ContactoPage() {
    const config = await getSiteConfigServer();

    return (
        <div className="relative min-h-screen pt-20 md:pt-24">
            {/* Semi-transparent content wrapper */}
            <div className="relative z-10 bg-black/40 backdrop-blur-sm min-h-screen">
                {/* Hero Section */}
                <section className="py-12 md:py-20 text-center container mx-auto px-4 md:px-6">
                    <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-4 md:mb-6">
                        <span className="gradient-text">Contacto</span>
                    </h1>
                    <p className="text-gray-400 max-w-2xl mx-auto text-base md:text-xl">
                        ¿Tenés un proyecto en mente? Hablemos y hagámoslo realidad.
                    </p>
                </section>

                {/* Contact Grid */}
                <section className="container mx-auto px-4 md:px-6 pb-16 md:pb-24">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                        {/* Contact Info */}
                        <div className="space-y-8">
                            <div>
                                <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                                    Información de Contacto
                                </h2>
                                <div className="space-y-4">
                                    {config.email_contacto && (
                                        <a
                                            href={`mailto:${config.email_contacto}`}
                                            className="flex items-center gap-4 p-4 glass-card group"
                                        >
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                                <Mail size={24} />
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">Email</p>
                                                <p className="text-white font-medium group-hover:text-quepia-cyan transition-colors">
                                                    {config.email_contacto}
                                                </p>
                                            </div>
                                        </a>
                                    )}

                                    {config.whatsapp && (
                                        <a
                                            href={`https://wa.me/${config.whatsapp.replace(/[^0-9]/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-4 p-4 glass-card group"
                                        >
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                                <Phone size={24} />
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">WhatsApp</p>
                                                <p className="text-white font-medium group-hover:text-quepia-cyan transition-colors">
                                                    {config.telefono || 'Enviar mensaje'}
                                                </p>
                                            </div>
                                        </a>
                                    )}

                                    {config.instagram && (
                                        <a
                                            href={config.instagram}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-4 p-4 glass-card group"
                                        >
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                                <Instagram size={24} />
                                            </div>
                                            <div>
                                                <p className="text-gray-400 text-sm">Instagram</p>
                                                <p className="text-white font-medium group-hover:text-quepia-cyan transition-colors">
                                                    Seguinos
                                                </p>
                                            </div>
                                        </a>
                                    )}

                                    <div className="flex items-center gap-4 p-4 glass-card">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                            <MapPin size={24} />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Ubicación</p>
                                            <p className="text-white font-medium">
                                                {config.direccion || 'Villa Carlos Paz, Córdoba, Argentina'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 p-4 glass-card">
                                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-quepia-purple to-quepia-cyan flex items-center justify-center text-white">
                                            <Clock size={24} />
                                        </div>
                                        <div>
                                            <p className="text-gray-400 text-sm">Horario</p>
                                            <p className="text-white font-medium">
                                                {config.horario_dias || 'Lunes a Viernes'}, {config.horario_horas || '9:00 - 18:00'}
                                            </p>
                                            {config.horario_extra && <p className="text-white/60 text-xs mt-1">{config.horario_extra}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact Form */}
                        <div className="glass-card p-6 md:p-8">
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                                Envianos un mensaje
                            </h2>
                            <form className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Nombre
                                    </label>
                                    <input
                                        type="text"
                                        className="admin-input"
                                        placeholder="Tu nombre"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        className="admin-input"
                                        placeholder="tu@email.com"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Servicio de interés
                                    </label>
                                    <select className="admin-input">
                                        <option value="">Seleccioná una opción</option>
                                        <option value="branding">Branding</option>
                                        <option value="diseno-grafico">Diseño Gráfico</option>
                                        <option value="video">Producción de Video</option>
                                        <option value="fotografia">Fotografía</option>
                                        <option value="marketing">Marketing</option>
                                        <option value="redes-sociales">Redes Sociales</option>
                                        <option value="packaging">Packaging</option>
                                        <option value="otro">Otro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Mensaje
                                    </label>
                                    <textarea
                                        className="admin-input min-h-[120px]"
                                        placeholder="Contanos sobre tu proyecto..."
                                        required
                                    />
                                </div>
                                <Button type="submit" className="w-full" size="lg">
                                    Enviar mensaje <ArrowRight size={18} className="ml-2" />
                                </Button>
                            </form>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
