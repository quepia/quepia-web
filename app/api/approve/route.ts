import { NextResponse } from 'next/server';
import { createClient } from '@/lib/sistema/supabase/server';

interface ApprovalToken {
  asset_id: string;
  user_id: string;
  exp: number;
}

function htmlResponse(title: string, message: string, success: boolean) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - Quepia</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0a0a;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .container {
      text-align: center;
      padding: 2rem;
      max-width: 480px;
    }
    .logo {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 2rem;
      color: #ffffff;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }
    p {
      color: #a0a0a0;
      font-size: 0.95rem;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">QUEPIA</div>
    <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: success ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const action = searchParams.get('action');

    if (!token || !action || !['approve', 'reject'].includes(action)) {
      return htmlResponse(
        'Enlace invalido',
        'El enlace ha expirado o es invalido.',
        false
      );
    }

    let decoded: ApprovalToken;
    try {
      decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    } catch {
      return htmlResponse(
        'Enlace invalido',
        'El enlace ha expirado o es invalido.',
        false
      );
    }

    if (!decoded.asset_id || !decoded.user_id || !decoded.exp) {
      return htmlResponse(
        'Enlace invalido',
        'El enlace ha expirado o es invalido.',
        false
      );
    }

    if (Date.now() > decoded.exp) {
      return htmlResponse(
        'Enlace expirado',
        'El enlace ha expirado o es invalido.',
        false
      );
    }

    const supabase = await createClient();

    // Get current asset status
    const { data: asset, error: fetchError } = await supabase
      .from('sistema_assets')
      .select('approval_status, iteration_count')
      .eq('id', decoded.asset_id)
      .single();

    if (fetchError || !asset) {
      return htmlResponse(
        'Error',
        'No se pudo encontrar el recurso solicitado.',
        false
      );
    }

    const fromStatus = asset.approval_status;
    let toStatus: string;
    let note: string;

    if (action === 'approve') {
      toStatus = 'approved_final';
      note = 'Aprobado via email';

      const { error: updateError } = await supabase
        .from('sistema_assets')
        .update({ approval_status: toStatus })
        .eq('id', decoded.asset_id);

      if (updateError) {
        console.error('Error actualizando asset:', updateError);
        return htmlResponse(
          'Error',
          'Hubo un error al procesar tu accion. Intenta nuevamente.',
          false
        );
      }
    } else {
      toStatus = 'changes_requested';
      note = 'Rechazado via email';

      const { error: updateError } = await supabase
        .from('sistema_assets')
        .update({
          approval_status: toStatus,
          iteration_count: (asset.iteration_count ?? 0) + 1,
        })
        .eq('id', decoded.asset_id);

      if (updateError) {
        console.error('Error actualizando asset:', updateError);
        return htmlResponse(
          'Error',
          'Hubo un error al procesar tu accion. Intenta nuevamente.',
          false
        );
      }
    }

    // Log the approval action
    const { error: logError } = await supabase
      .from('sistema_approval_log')
      .insert({
        asset_id: decoded.asset_id,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: decoded.user_id,
        note,
      });

    if (logError) {
      console.error('Error insertando en approval_log:', logError);
    }

    return htmlResponse(
      'Gracias!',
      'Tu accion fue registrada.',
      true
    );
  } catch (err) {
    console.error('Error en /api/approve:', err);
    return htmlResponse(
      'Error',
      'Hubo un error inesperado. Intenta nuevamente.',
      false
    );
  }
}
