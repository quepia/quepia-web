import { Html, Head, Preview, Body, Container, Section, Text, Heading, Button } from '@react-email/components'

interface ProposalEmailProps {
  clientName: string
  proposalTitle: string
  proposalSummary?: string
  totalAmount: string
  currency: string
  projectName?: string
  actionUrl: string
}

export default function ProposalEmail({
  clientName,
  proposalTitle,
  proposalSummary,
  totalAmount,
  currency,
  projectName,
  actionUrl,
}: ProposalEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Propuesta lista para revisar</Preview>
      <Body style={{ backgroundColor: '#0a0a0a', color: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '32px' }}>
          <Section style={{ marginBottom: '24px' }}>
            <Text style={{ color: '#2AE7E4', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              Quepia Propuestas
            </Text>
            <Heading style={{ fontSize: '24px', margin: '12px 0 8px' }}>Hola {clientName},</Heading>
            <Text style={{ color: '#b5b5b5', margin: 0 }}>
              Te compartimos la propuesta <strong style={{ color: '#ffffff' }}>{proposalTitle}</strong>
              {projectName ? ` para ${projectName}` : ''}.
            </Text>
          </Section>

          {proposalSummary ? (
            <Section style={{ backgroundColor: '#111111', padding: '16px', borderRadius: '12px', marginBottom: '16px' }}>
              <Text style={{ color: '#d7d7d7', margin: 0 }}>{proposalSummary}</Text>
            </Section>
          ) : null}

          <Section style={{ backgroundColor: '#111111', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
            <Text style={{ color: '#9ca3af', fontSize: '12px', margin: 0 }}>Total</Text>
            <Heading style={{ fontSize: '22px', margin: '6px 0 0' }}>
              {currency} {totalAmount}
            </Heading>
          </Section>

          <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Button
              href={actionUrl}
              style={{
                backgroundColor: '#2AE7E4',
                color: '#000',
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: 700,
              }}
            >
              Ver propuesta
            </Button>
          </Section>

          <Text style={{ color: '#6b7280', fontSize: '12px', textAlign: 'center' }}>
            Si no solicitaste esta propuesta, podés ignorar este mensaje.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
