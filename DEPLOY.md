# Guía de Despliegue en Vercel

## 1. Preparación en GitHub

Asegurate de que tus últimos cambios estén subidos a GitHub.
Si no has hecho commit de tus últimos cambios, hazlo ahora:

```bash
git add .
git commit -m "Preparando para deploy"
git push
```

## 2. Configuración en Vercel

1. Ve a [Vercel Dashboard](https://vercel.com/dashboard).
2. Haz clic en **Add New...** -> **Project**.
3. Importa tu repositorio de GitHub `quepia-creative-agency` (o el nombre que tenga).
4. En "Framework Preset", debería detectar automáticamente **Next.js**.

## 3. Variables de Entorno

En la sección **Environment Variables** de la configuración del proyecto en Vercel, debes agregar las siguientes variables (copia los valores de tu archivo `.env.local`):

| Clave | Descripción |
|-------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL de tu proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` | Clave pública (Anon) de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (Anon) de Supabase (normalmente igual a la anterior) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de rol de servicio (Service Role Key) |
| `SUPABASE_ACCESS_TOKEN` | Token de acceso (si es necesario para scripts de build, opcional si no se usa en runtime) |
| `RESEND_API_KEY` | API Key de Resend para correos |
| `CONTACT_FORM_TO` | Email que recibirá los mensajes del formulario de contacto |
| `EMAIL_FROM` | Remitente validado en Resend (ej. `Quepia <notificaciones@quepia.com>`) |

> **Nota:** Asegúrate de copiar los valores exactos, sin comillas extra si no son necesarias.

## 4. Despliegue

1. Haz clic en **Deploy**.
2. Espera a que termine el proceso de build.
3. Si el build es exitoso, verás una pantalla de felicitaciones.

## 5. Configuración de Dominio (Opcional)

Si tienes un dominio personalizado (ej. `quepia.com`), ve a **Settings** -> **Domains** en tu proyecto de Vercel y agrégalo. Sigue las instrucciones para configurar los registros DNS.
