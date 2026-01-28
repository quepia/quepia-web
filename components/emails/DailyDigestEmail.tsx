import {
    Body,
    Container,
    Head,
    Heading,
    Html,
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

interface DailyDigestEmailProps {
    userName: string;
    date: string;
    overdueCount: number;
    upcomingCount: number;
    highlights: Array<{
        title: string;
        project: string;
        type: "deadline" | "approval" | "comment";
        url: string;
        time?: string;
    }>;
    actionUrl: string;
}

const typeConfig = {
    deadline: { color: "#ef4444", label: "Vence", icon: "⏰" },
    approval: { color: "#f97316", label: "Aprobación", icon: "👁" },
    comment: { color: "#3b82f6", label: "Comentario", icon: "💬" },
};

export default function DailyDigestEmail({
    userName = "Lauty",
    date = "27 Ene, 2026",
    overdueCount = 2,
    upcomingCount = 5,
    highlights = [
        { title: "Entregar Banner Q1", project: "Campaña Redes", type: "deadline", url: "#", time: "Hoy 14:00" },
        { title: "Revisión de Video Reel", project: "Lanzamiento", type: "approval", url: "#" },
        { title: "Comentario en Briefing", project: "Web Corp", type: "comment", url: "#" },
    ],
    actionUrl = "https://quepia.com/sistema",
}: DailyDigestEmailProps) {
    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>Tu resumen diario - {date}</Preview>
                <Body className="bg-[#0a0a0a] font-sans">
                    <Container className="mx-auto py-8 px-4">
                        {/* Main Card */}
                        <Section className="bg-[#111111] rounded-2xl overflow-hidden border border-white/10 max-w-[600px] mx-auto">
                            {/* Header */}
                            <Section className="bg-gradient-to-r from-[#2AE7E4]/10 to-[#881078]/10 px-8 py-8 border-b border-white/5">
                                <Text className="text-[#2AE7E4] text-xs uppercase tracking-[0.2em] m-0 mb-2 font-medium">
                                    Resumen Diario
                                </Text>
                                <Heading className="text-3xl font-light text-white mb-2">
                                    Buenos días, <span className="text-[#2AE7E4]">{userName}</span>
                                </Heading>
                                <Text className="text-white/50 text-sm m-0">
                                    Aquí tienes tu resumen para hoy, <span className="text-white/70">{date}</span>.
                                </Text>
                            </Section>

                            {/* Stats */}
                            <Section className="px-8 py-6">
                                <Row className="rounded-xl overflow-hidden border border-white/10">
                                    <Column 
                                        className="w-1/2 p-5 text-center"
                                        style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                                    >
                                        <Text className="text-3xl font-light text-[#ef4444] m-0 mb-1">{overdueCount}</Text>
                                        <Text className="text-xs text-[#ef4444]/60 m-0 uppercase tracking-wider font-medium">
                                            Vencidas
                                        </Text>
                                    </Column>
                                    <Column 
                                        className="w-1/2 p-5 text-center border-l border-white/5"
                                        style={{ backgroundColor: 'rgba(42, 231, 228, 0.1)' }}
                                    >
                                        <Text className="text-3xl font-light text-[#2AE7E4] m-0 mb-1">{upcomingCount}</Text>
                                        <Text className="text-xs text-[#2AE7E4]/60 m-0 uppercase tracking-wider font-medium">
                                            Para Hoy
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Highlights */}
                            <Section className="px-8 pb-8">
                                <Text className="text-white/30 text-xs uppercase tracking-[0.2em] mb-4 font-medium">
                                    Lo más importante
                                </Text>

                                <Section className="space-y-3">
                                    {highlights.map((item, i) => {
                                        const config = typeConfig[item.type];
                                        return (
                                            <Link 
                                                key={i} 
                                                href={item.url}
                                                className="block no-underline"
                                            >
                                                <Section 
                                                    className="p-4 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all"
                                                >
                                                    <Row>
                                                        <Column className="w-10">
                                                            <div 
                                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                                                                style={{ backgroundColor: `${config.color}20` }}
                                                            >
                                                                <span>{config.icon}</span>
                                                            </div>
                                                        </Column>
                                                        <Column>
                                                            <Text className="text-white text-sm font-medium m-0 mb-1">
                                                                {item.title}
                                                            </Text>
                                                            <Text className="text-white/40 text-xs m-0">
                                                                <span style={{ color: config.color }}>{item.project}</span>
                                                                {item.time && (
                                                                    <span className="text-white/30"> • {item.time}</span>
                                                                )}
                                                            </Text>
                                                        </Column>
                                                        <Column className="w-6 text-right">
                                                            <span className="text-white/20">→</span>
                                                        </Column>
                                                    </Row>
                                                </Section>
                                            </Link>
                                        );
                                    })}
                                </Section>

                                {highlights.length === 0 && (
                                    <Section className="p-8 text-center rounded-xl border border-white/5 bg-white/[0.02]">
                                        <Text className="text-white/30 text-sm m-0">
                                            No hay actividades pendientes para hoy 🎉
                                        </Text>
                                    </Section>
                                )}
                            </Section>

                            {/* CTA */}
                            <Section className="px-8 pb-8 text-center">
                                <Link
                                    href={actionUrl}
                                    className="inline-block bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-8 py-4 rounded-xl font-medium text-sm no-underline shadow-lg shadow-[#2AE7E4]/20"
                                >
                                    Ir al Dashboard
                                </Link>
                            </Section>

                            {/* Footer */}
                            <Hr className="border-white/5 mx-8" />
                            <Section className="px-8 py-6">
                                <Row>
                                    <Column>
                                        <Text className="text-xs text-white/30 m-0">
                                            Frecuencia: Diaria (09:00 AM)
                                        </Text>
                                    </Column>
                                    <Column className="text-right">
                                        <Link 
                                            href="https://quepia.com/sistema/configuracion" 
                                            className="text-xs text-white/40 underline hover:text-white/60"
                                        >
                                            Cambiar preferencias
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
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
}
