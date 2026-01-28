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

interface GeneralNotificationEmailProps {
    recipientName: string;
    title: string;
    content: string;
    actionUrl?: string;
    actionText?: string;
}

export default function GeneralNotificationEmail({
    recipientName = "Usuario",
    title = "Nueva actualización en tu proyecto",
    content = "Se ha actualizado el estado de tu proyecto 'Campaña Redes' a 'En Progreso'.",
    actionUrl = "https://quepia.com/sistema",
    actionText = "Ver en el Sistema",
}: GeneralNotificationEmailProps) {
    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>{title}</Preview>
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
                                        <Text className="text-[#2AE7E4] text-xs uppercase tracking-[0.2em] m-0 font-medium">
                                            Notificación
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Content */}
                            <Section className="px-8 py-8">
                                <Heading className="text-2xl font-light text-white mb-2">
                                    Hola <span className="text-[#2AE7E4]">{recipientName}</span>,
                                </Heading>
                                
                                {/* Title Badge */}
                                <Section className="mb-6">
                                    <div className="inline-block bg-[#2AE7E4]/10 border border-[#2AE7E4]/30 rounded-full px-4 py-2">
                                        <Text className="text-[#2AE7E4] text-sm font-medium m-0">
                                            {title}
                                        </Text>
                                    </div>
                                </Section>

                                {/* Content */}
                                <Section className="mb-8">
                                    <div className="p-5 bg-[#0a0a0a] rounded-xl border border-white/5">
                                        <Text className="text-white/70 text-base m-0 whitespace-pre-wrap leading-relaxed">
                                            {content}
                                        </Text>
                                    </div>
                                </Section>

                                {/* Action Button */}
                                {actionUrl && (
                                    <Section className="text-center">
                                        <Button
                                            className="bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-8 py-4 rounded-xl font-medium text-sm no-underline shadow-lg shadow-[#2AE7E4]/20"
                                            href={actionUrl}
                                        >
                                            {actionText}
                                        </Button>
                                    </Section>
                                )}
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
