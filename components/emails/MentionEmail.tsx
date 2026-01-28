import {
    Body,
    Button,
    Container,
    Head,

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

interface MentionEmailProps {
    actorName: string;
    contextTitle: string;
    commentContent: string;
    actionUrl: string;
}

export default function MentionEmail({
    actorName = "Maria",
    contextTitle = "Diseño de Home V2",
    commentContent = "@Juan ¿podrías revisar si este color coincide con el manual?",
    actionUrl = "https://quepia.com/sistema",
}: MentionEmailProps) {
    const initials = actorName.charAt(0).toUpperCase();
    
    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>{actorName} te mencionó en {contextTitle}</Preview>
                <Body className="bg-[#0a0a0a] font-sans">
                    <Container className="mx-auto py-8 px-4">
                        {/* Main Card */}
                        <Section className="bg-[#111111] rounded-2xl overflow-hidden border border-white/10 max-w-[600px] mx-auto">
                            {/* Header */}
                            <Section className="bg-gradient-to-r from-[#1a1a1a] to-[#111111] px-8 py-6 border-b border-white/5">
                                <Row>
                                    <Column>
                                        <Text className="text-[#3b82f6] text-xs uppercase tracking-[0.2em] m-0 font-medium">
                                            Nueva Mención
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Content */}
                            <Section className="px-8 py-8">
                                {/* Actor Info */}
                                <Section className="mb-8">
                                    <Row>
                                        <Column className="w-12">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2AE7E4]/30 to-[#881078]/30 flex items-center justify-center text-white font-bold text-sm border border-white/10">
                                                {initials}
                                            </div>
                                        </Column>
                                        <Column>
                                            <Text className="text-white font-medium text-base m-0">
                                                {actorName} <span className="text-white/50 font-normal">te mencionó</span>
                                        </Text>
                                            <Text className="text-white/30 text-xs m-0 mt-1">
                                                {new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </Column>
                                    </Row>
                                </Section>

                                {/* Context */}
                                <Section className="mb-6">
                                    <Text className="text-white/50 text-sm m-0 mb-4">
                                        En el proyecto{" "}
                                        <span className="text-[#2AE7E4] font-medium">{contextTitle}</span>:
                                    </Text>
                                </Section>

                                {/* Comment */}
                                <Section className="mb-8">
                                    <div className="relative pl-5 border-l-2 border-[#2AE7E4]/50">
                                        <div className="absolute -left-[5px] top-0 w-2 h-2 rounded-full bg-[#2AE7E4]" />
                                        <Text className="text-white/80 text-base italic leading-relaxed m-0 whitespace-pre-wrap">
                                            &ldquo;{commentContent}&rdquo;
                                        </Text>
                                    </div>
                                </Section>

                                {/* Action Button */}
                                <Section>
                                    <Button
                                        className="bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-8 py-4 rounded-xl font-medium text-sm no-underline shadow-lg shadow-[#2AE7E4]/20"
                                        href={actionUrl}
                                    >
                                        Responder
                                    </Button>
                                </Section>
                            </Section>

                            {/* Footer */}
                            <Hr className="border-white/5 mx-8" />
                            <Section className="px-8 py-6">
                                <Text className="text-xs text-white/30 text-center m-0">
                                    Gestiona tus notificaciones en{" "}
                                    <Link 
                                        href="https://quepia.com/sistema/configuracion" 
                                        className="text-white/40 underline hover:text-white/60"
                                    >
                                        configuración
                                    </Link>
                                </Text>
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
