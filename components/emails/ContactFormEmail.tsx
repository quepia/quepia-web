import {
    Body,
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

interface ContactFormEmailProps {
    name: string;
    email: string;
    service: string;
    message: string;
}

export default function ContactFormEmail({
    name = "Lautaro Lopez",
    email = "lauty@example.com",
    service = "Desarrollo Web",
    message = "Hola, me gustaría cotizar una web nueva.",
}: ContactFormEmailProps) {
    return (
        <Html>
            <Tailwind>
                <Head />
                <Preview>Nuevo mensaje de {name}</Preview>
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
                                            Nuevo Lead
                                        </Text>
                                    </Column>
                                </Row>
                            </Section>

                            {/* Content */}
                            <Section className="px-8 py-8">
                                <Heading className="text-2xl font-light text-white mb-2">
                                    Nuevo <span className="text-[#2AE7E4]">Mensaje</span>
                                </Heading>
                                <Text className="text-white/50 text-base mb-8">
                                    Has recibido una nueva consulta a través del formulario web.
                                </Text>

                                {/* Data Grid */}
                                <Section className="bg-[#0a0a0a] rounded-xl border border-white/10 overflow-hidden">
                                    {/* Name */}
                                    <Row className="border-b border-white/5">
                                        <Column className="w-1/3 p-4 bg-white/[0.02]">
                                            <Text className="text-[#2AE7E4] text-xs uppercase tracking-wider m-0 font-medium">
                                                Nombre
                                            </Text>
                                        </Column>
                                        <Column className="w-2/3 p-4">
                                            <Text className="text-white text-base m-0">{name}</Text>
                                        </Column>
                                    </Row>

                                    {/* Email */}
                                    <Row className="border-b border-white/5">
                                        <Column className="w-1/3 p-4 bg-white/[0.02]">
                                            <Text className="text-[#2AE7E4] text-xs uppercase tracking-wider m-0 font-medium">
                                                Email
                                            </Text>
                                        </Column>
                                        <Column className="w-2/3 p-4">
                                            <Link 
                                                href={`mailto:${email}`}
                                                className="text-white text-base no-underline hover:text-[#2AE7E4] transition-colors"
                                            >
                                                {email}
                                            </Link>
                                        </Column>
                                    </Row>

                                    {/* Service */}
                                    <Row className="border-b border-white/5">
                                        <Column className="w-1/3 p-4 bg-white/[0.02]">
                                            <Text className="text-[#2AE7E4] text-xs uppercase tracking-wider m-0 font-medium">
                                                Servicio
                                            </Text>
                                        </Column>
                                        <Column className="w-2/3 p-4">
                                            <Text className="text-white text-base m-0">{service}</Text>
                                        </Column>
                                    </Row>

                                    {/* Message */}
                                    <Row>
                                        <Column className="w-1/3 p-4 bg-white/[0.02] align-top">
                                            <Text className="text-[#2AE7E4] text-xs uppercase tracking-wider m-0 font-medium">
                                                Mensaje
                                            </Text>
                                        </Column>
                                        <Column className="w-2/3 p-4">
                                            <Text className="text-white/80 text-base m-0 whitespace-pre-wrap leading-relaxed">
                                                {message}
                                            </Text>
                                        </Column>
                                    </Row>
                                </Section>

                                {/* Quick Actions */}
                                <Section className="mt-8 flex gap-3">
                                    <Link
                                        href={`mailto:${email}?subject=Re: Tu consulta en Quepia&body=Hola ${name},%0D%0A%0D%0AGracias por contactarnos...`}
                                        className="inline-block bg-gradient-to-r from-[#2AE7E4] to-[#881078] text-white px-6 py-3 rounded-xl font-medium text-sm no-underline text-center flex-1"
                                    >
                                        Responder
                                    </Link>
                                    <Link
                                        href="https://quepia.com/sistema"
                                        className="inline-block bg-white/5 text-white px-6 py-3 rounded-xl font-medium text-sm no-underline text-center border border-white/10 hover:bg-white/10 transition-colors flex-1"
                                    >
                                        Ir al Sistema
                                    </Link>
                                </Section>
                            </Section>

                            {/* Footer */}
                            <Hr className="border-white/5 mx-8" />
                            <Section className="px-8 py-6">
                                <Text className="text-xs text-white/30 text-center m-0">
                                    Enviado desde el formulario de contacto de quepia.com
                                    <br />
                                    <span className="text-white/20">{new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
