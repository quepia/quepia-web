import { NextResponse } from 'next/server';
import { sendEmail, type EmailType } from '@/lib/sistema/email-service';

interface SendEmailBody {
  type: EmailType;
  to: string;
  data: Record<string, any>;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { type, to, data } = body;

    const result = await sendEmail({ type, to, data });

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
