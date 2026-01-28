import { NextResponse } from 'next/server';
import { createClient } from '@/lib/sistema/supabase/server';
import { notifyUser } from '@/lib/sistema/notifications';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const userId = searchParams.get('userId');

  const supabase = await createClient();

  if (action === 'check_env') {
    return NextResponse.json({
      resendKeyExists: !!process.env.RESEND_API_KEY,
      resendKeyPrefix: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 5) + '...' : null
    });
  }

  if (action === 'list_users') {
    const { data: users, error } = await supabase.from('sistema_users').select('id, nombre, email');
    return NextResponse.json({ users, error });
  }

  if (action === 'test_notification' && userId) {
    console.log("Testing notification for", userId);
    const cleanUserId = userId.trim();
    await notifyUser({
      userId: cleanUserId,
      type: 'system',
      title: 'Test Notification via Debug API',
      content: 'This is a test to verify email sending.',
      link: '/sistema',
      data: { source: 'debug-api' }
    });
    return NextResponse.json({ success: true, message: "Notification triggered. Check server logs." });
  }

  return NextResponse.json({ usage: "?action=check_env | ?action=list_users | ?action=test_notification&userId=..." });
}
