import { Resend } from 'resend';
import { render } from '@react-email/components';
import ApprovalRequestEmail from '@/components/emails/ApprovalRequestEmail';
import DailyDigestEmail from '@/components/emails/DailyDigestEmail';
import MentionEmail from '@/components/emails/MentionEmail';
import ContactFormEmail from '@/components/emails/ContactFormEmail';
import GeneralNotificationEmail from '@/components/emails/GeneralNotificationEmail';
import ProposalEmail from '@/components/emails/ProposalEmail';
// cleaned up imports

const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

export type EmailType = 'approval_request' | 'daily_digest' | 'mention' | 'contact_form' | 'general_notification' | 'proposal';

export interface SendEmailParams {
    type: EmailType;
    to: string;
    data: Record<string, any>;
}

export async function sendEmail({ type, to, data }: SendEmailParams) {
    try {
        if (!type || !to || !data) {
            return { success: false, error: 'Missing required fields' };
        }

        let subject: string;
        let html: string;

        switch (type) {
            case 'approval_request':
                subject = `Solicitud de aprobación: ${data.assetName}`;
                html = await render(ApprovalRequestEmail(data as any));
                break;
            case 'daily_digest':
                subject = `Resumen diario - ${new Date().toLocaleDateString('es-AR')}`;
                html = await render(DailyDigestEmail(data as any));
                break;
            case 'mention':
                subject = `${data.mentionerName} te mencionó en ${data.contextName}`;
                html = await render(MentionEmail(data as any));
                break;
            case 'contact_form':
                subject = `Nuevo Contacto: ${data.name} - ${data.service}`;
                html = await render(ContactFormEmail(data as any));
                break;
            case 'general_notification':
                subject = data.title || 'Nueva notificación de Quepia';
                html = await render(GeneralNotificationEmail(data as any));
                break;
            case 'proposal':
                subject = `Propuesta: ${data.proposalTitle}`;
                html = await render(ProposalEmail(data as any));
                break;
            default:
                return { success: false, error: `Unsupported email type: ${type}` };
        }

        if (!resend) {
            console.log('[DEV] RESEND_API_KEY missing. Email simulated:', { to, subject, type });
            return { success: true, dev: true };
        }

        const { data: result, error } = await resend.emails.send({
            from: 'Quepia <notificaciones@quepia.com>',
            to,
            subject,
            html,
        });

        if (error) {
            console.error('Error sending email via Resend:', error);
            return { success: false, error: error.message };
        }

        return { success: true, id: result?.id };
    } catch (err) {
        console.error('Error in sendEmail service:', err);
        return { success: false, error: 'Internal service error' };
    }
}
