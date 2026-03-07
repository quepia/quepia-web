import { NextResponse } from 'next/server';
import { sendEmail, type EmailType } from '@/lib/sistema/email-service';

interface SendEmailBody {
  type: EmailType;
  to?: string;
  data: Record<string, any>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendEmailBody;
    const { type, to, data } = body;

    const recipientForContact =
      process.env.CONTACT_FORM_TO ||
      process.env.ADMIN_EMAIL ||
      'quepiacomunicacion@gmail.com';

    const resolvedRecipient = type === 'contact_form' ? recipientForContact : to;

    if (!resolvedRecipient) {
      return NextResponse.json(
        { error: 'Missing recipient for email type' },
        { status: 400 }
      );
    }

    const result = await sendEmail({ type, to: resolvedRecipient, data });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error sending email' },
        { status: result.error === 'Missing required fields' ? 400 : 500 }
      );
    }

    return NextResponse.json({ success: true, id: result.id, dev: result.dev });
  } catch (err) {
    console.error('Error in /api/send-email:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
