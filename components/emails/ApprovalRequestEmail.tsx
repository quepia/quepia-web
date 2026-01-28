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

interface ApprovalRequestEmailProps {
    assetName: string;
    assetUrl: string;
    previewUrl: string;
    projectByName: string;
    approverName: string;
    actionUrl: string;
}

export default function ApprovalRequestEmail({
    assetName = "Banner Q1",
    assetUrl = "https://example.com/asset",
    previewUrl = "https://picsum.photos/600/300",
    projectByName = "Campaña Redes",
    approverName = "Juan",
    actionUrl = "https://quepia.com/sistema",
}: ApprovalRequestEmailProps) {
    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>Solicitud de aprobación: {assetName}</Preview>
                <Body className="bg-[#0a0a0a] font-sans">
                    {/* Outer Container with gradient border effect */}
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
                                            Aprobación
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Content */}
                            <Section className="px-8 py-8">
                                <Heading className="text-2xl font-light text-white mb-2">
                                    Hola <span className="text-[#2AE7E4]">{approverName}</span>,
                                </Heading>
                                <Text className="text-white/60 text-base mb-8 leading-relaxed">
                                    Se ha subido un nuevo entregable que requiere tu revisión en el proyecto{" "}
                                    <span className="text-white font-medium">{projectByName}</span>.
                                </Text>

                                {/* Asset Preview Card */}
                                <Section className="mb-8 rounded-xl overflow-hidden border border-white/10 bg-[#0a0a0a]">
                                    <Img
                                        src={previewUrl}
                                        width="100%"
                                        height="auto"
                                        alt={assetName}
                                        className="object-cover"
                                    />
                                    <div className="p-5 bg-gradient-to-r from-[#1a1a1a] to-[#111111]">
                                        <Text className="text-white font-medium text-lg m-0 mb-1">{assetName}</Text>
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-[#eab308] animate-pulse" />
                                            <Text className="text-white/40 text-sm m-0">Esperando revisión</Text>
                                        </div>
                                    </div>
                                </Section>

                                {/* Action Button */}
                                <Section className="text-center mb-8">
                                    <Button
                                        className="bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-8 py-4 rounded-xl font-medium text-sm no-underline shadow-lg shadow-[#2AE7E4]/20"
                                        href={actionUrl}
                                    >
                                        Revisar y Aprobar
                                    </Button>
                                </Section>

                                {/* Secondary Link */}
                                <Section className="text-center">
                                    <Link 
                                        href={assetUrl}
                                        className="text-white/40 text-sm no-underline hover:text-white/60 transition-colors border-b border-white/20 pb-0.5"
                                    >
                                        Ver en el navegador
                                    </Link>
                                </Section>
                            </Section>

                            {/* Footer */}
                            <Hr className="border-white/5 mx-8" />
                            <Section className="px-8 py-6">
                                <Text className="text-xs text-white/30 text-center m-0">
                                    Recibiste este email porque eres aprobador en este proyecto.
                                    <br />
                                    <Link 
                                        href="https://quepia.com/sistema/configuracion" 
                                        className="text-white/40 underline hover:text-white/60"
                                    >
                                        Gestionar preferencias
                                    </Link>
                                </Text>
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
