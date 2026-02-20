import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
    Tailwind,
    Hr,
    Row,
    Column,
} from "@react-email/components";
import * as React from "react";

interface EfemerideReminderEmailProps {
    recipientName: string;
    efemerideName: string;
    efemerideDate: string;
    efemerideCategoria: string;
    daysLeft: number;
    pendingProjects: string[];
    actionUrl?: string;
}

const CATEGORIA_COLORS: Record<string, string> = {
    patria: '#3b82f6',
    comercial: '#22c55e',
    conmemorativa: '#f97316',
    otro: '#6b7280',
    general: '#8b5cf6',
};

export default function EfemerideReminderEmail({
    recipientName = "Admin",
    efemerideName = "Día de la Madre",
    efemerideDate = "20/10/2026",
    efemerideCategoria = "comercial",
    daysLeft = 7,
    pendingProjects = ["Cliente A", "Cliente B"],
    actionUrl = "https://quepia.com/sistema?view=efemerides",
}: EfemerideReminderEmailProps) {
    const categoriaColor = CATEGORIA_COLORS[efemerideCategoria] || '#6b7280';

    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>{`${efemerideName} en ${daysLeft} días - ${pendingProjects.length} proyectos pendientes`}</Preview>
                <Body className="bg-[#0a0a0a] font-sans">
                    <Container className="mx-auto py-8 px-4">
                        {/* Main Card */}
                        <Section className="bg-[#111111] rounded-2xl overflow-hidden border border-white/10 max-w-[600px] mx-auto">
                            {/* Header */}
                            <Section className="bg-gradient-to-r from-[#1a1a1a] to-[#111111] px-8 py-6 border-b border-white/5">
                                <Row>
                                    <Column>
                                        <Img
                                            src="https://quepia.com/Logo_Quepia.svg"
                                            width="100"
                                            height="28"
                                            alt="Quepia"
                                            className="opacity-90"
                                        />
                                    </Column>
                                    <Column className="text-right">
                                        <Text className="text-[#f97316] text-xs uppercase tracking-[0.2em] m-0 font-medium">
                                            Recordatorio
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Content */}
                            <Section className="px-8 py-8">
                                <Heading className="text-2xl font-light text-white mb-2">
                                    Hola <span className="text-[#2AE7E4]">{recipientName}</span>,
                                </Heading>

                                {/* Categoria Badge */}
                                <Section className="mb-4">
                                    <div
                                        className="inline-block rounded-full px-4 py-1.5"
                                        style={{
                                            backgroundColor: `${categoriaColor}20`,
                                            border: `1px solid ${categoriaColor}50`,
                                        }}
                                    >
                                        <Text className="text-sm font-medium m-0" style={{ color: categoriaColor }}>
                                            {efemerideCategoria.charAt(0).toUpperCase() + efemerideCategoria.slice(1)}
                                        </Text>
                                    </div>
                                </Section>

                                {/* Efemeride Info */}
                                <Section className="mb-6">
                                    <div className="p-5 bg-[#0a0a0a] rounded-xl border border-white/5">
                                        <Text className="text-white text-xl font-semibold m-0 mb-2">
                                            {efemerideName}
                                        </Text>
                                        <Text className="text-white/60 text-sm m-0 mb-3">
                                            Fecha: {efemerideDate}
                                        </Text>
                                        <div
                                            className="inline-block rounded-lg px-3 py-1.5"
                                            style={{ backgroundColor: '#f9731620', border: '1px solid #f9731640' }}
                                        >
                                            <Text className="text-[#f97316] text-sm font-bold m-0">
                                                En {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
                                            </Text>
                                        </div>
                                    </div>
                                </Section>

                                {/* Pending Projects */}
                                {pendingProjects.length > 0 && (
                                    <Section className="mb-8">
                                        <Text className="text-white/80 text-sm font-medium mb-3 m-0">
                                            Proyectos sin asset listo ({pendingProjects.length}):
                                        </Text>
                                        <div className="p-4 bg-[#dc262610] rounded-xl border border-[#dc262630]">
                                            {pendingProjects.map((name, i) => (
                                                <Text key={i} className="text-white/70 text-sm m-0 py-1">
                                                    • {name}
                                                </Text>
                                            ))}
                                        </div>
                                    </Section>
                                )}

                                {/* Action Button */}
                                <Section className="text-center">
                                    <Button
                                        className="bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-8 py-4 rounded-xl font-medium text-sm no-underline shadow-lg shadow-[#2AE7E4]/20"
                                        href={actionUrl}
                                    >
                                        Ver en el Sistema
                                    </Button>
                                </Section>
                            </Section>

                            {/* Footer */}
                            <Hr className="border-white/5 mx-8" />
                            <Section className="px-8 py-6">
                                <Row>
                                    <Column>
                                        <Link
                                            href="https://quepia.com/sistema"
                                            className="text-xs text-white/40 underline hover:text-white/60"
                                        >
                                            Ir al Sistema
                                        </Link>
                                    </Column>
                                    <Column className="text-right">
                                        <Link
                                            href="https://quepia.com/sistema/configuracion"
                                            className="text-xs text-white/40 underline hover:text-white/60"
                                        >
                                            Configuración
                                        </Link>
                                    </Column>
                                </Row>
                            </Section>
                        </Section>

                        {/* Bottom Logo */}
                        <Section className="text-center mt-8">
                            <Text className="text-white/20 text-xs uppercase tracking-[0.3em] m-0">
                                Quepia® Creative Studio
                            </Text>
                            <Text className="text-white/10 text-xs mt-1 m-0">
                                Villa Carlos Paz, Argentina
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}
