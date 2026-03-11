-- ============================================
-- QUEPIA - CONFIGURACIÓN DEL SITIO
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Crear tabla de configuración
CREATE TABLE IF NOT EXISTS public.configuracion (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT DEFAULT 'text', -- text, email, url, textarea, json
  categoria TEXT DEFAULT 'general',
  orden INT DEFAULT 0,
  fecha_actualizacion TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crear tabla de miembros del equipo
CREATE TABLE IF NOT EXISTS public.equipo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  bio TEXT,
  imagen_url TEXT,
  instagram TEXT,
  linkedin TEXT,
  email TEXT,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Habilitar RLS
ALTER TABLE public.configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo ENABLE ROW LEVEL SECURITY;

-- 4. Policies para configuracion
DROP POLICY IF EXISTS "Public read configuracion" ON public.configuracion;
CREATE POLICY "Public read configuracion" ON public.configuracion FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth write configuracion" ON public.configuracion;
CREATE POLICY "Auth write configuracion" ON public.configuracion FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Policies para equipo
DROP POLICY IF EXISTS "Public read equipo" ON public.equipo;
CREATE POLICY "Public read equipo" ON public.equipo FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth write equipo" ON public.equipo;
CREATE POLICY "Auth write equipo" ON public.equipo FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================
-- DATOS INICIALES DE CONFIGURACIÓN
-- ============================================

-- Limpiar datos existentes
DELETE FROM public.configuracion;
DELETE FROM public.equipo;

-- INFORMACIÓN DE CONTACTO
INSERT INTO public.configuracion (clave, valor, descripcion, tipo, categoria, orden) VALUES
('email_contacto', 'quepiacomunicacion@gmail.com', 'Email principal de contacto', 'email', 'contacto', 1),
('telefono', '+54 9 3541 123456', 'Teléfono de contacto', 'text', 'contacto', 2),
('whatsapp', '+5493541123456', 'Número de WhatsApp (sin espacios ni guiones)', 'text', 'contacto', 3),
('direccion', 'Villa Carlos Paz, Córdoba, Argentina', 'Dirección física', 'text', 'contacto', 4);

-- HORARIOS
INSERT INTO public.configuracion (clave, valor, descripcion, tipo, categoria, orden) VALUES
('horario_dias', 'Lunes a Viernes', 'Días de atención', 'text', 'horarios', 1),
('horario_horas', '9:00 - 18:00', 'Horario de atención', 'text', 'horarios', 2),
('horario_extra', 'Fines de semana: Solo urgencias', 'Información adicional de horarios', 'text', 'horarios', 3);

-- REDES SOCIALES
INSERT INTO public.configuracion (clave, valor, descripcion, tipo, categoria, orden) VALUES
('instagram', 'https://instagram.com/quepia.studio', 'Link a Instagram', 'url', 'redes', 1),
('facebook', '', 'Link a Facebook (dejar vacío si no aplica)', 'url', 'redes', 2),
('linkedin', '', 'Link a LinkedIn', 'url', 'redes', 3),
('twitter', '', 'Link a Twitter/X', 'url', 'redes', 4),
('tiktok', '', 'Link a TikTok', 'url', 'redes', 5),
('youtube', '', 'Link a YouTube', 'url', 'redes', 6);

-- INFORMACIÓN DE LA EMPRESA
INSERT INTO public.configuracion (clave, valor, descripcion, tipo, categoria, orden) VALUES
('nombre_empresa', 'Quepia', 'Nombre de la empresa', 'text', 'empresa', 1),
('slogan', 'Consultora Creativa', 'Slogan o tagline', 'text', 'empresa', 2),
('descripcion_corta', 'Hacemos crecer tu identidad visual con innovación.', 'Descripción corta para SEO y redes', 'textarea', 'empresa', 3),
('descripcion_larga', 'Quepia es una consultora creativa de Villa Carlos Paz, Córdoba, Argentina. Especialistas en diseño gráfico, branding, marketing, gestión de redes sociales, producción de video y fotografía.', 'Descripción completa', 'textarea', 'empresa', 4),
('anio_fundacion', '2020', 'Año de fundación', 'text', 'empresa', 5),
('cantidad_proyectos', '50+', 'Cantidad de proyectos realizados', 'text', 'empresa', 6);

-- TEXTOS PERSONALIZABLES
INSERT INTO public.configuracion (clave, valor, descripcion, tipo, categoria, orden) VALUES
('hero_titulo', 'CONSULTORÍA PARA MEJORAR.', 'Título principal del hero', 'text', 'textos', 1),
('hero_subtitulo', '(RE)inventá tu marca con Quepia', 'Subtítulo del hero', 'text', 'textos', 2),
('cta_footer', '¿Listo para crear algo increíble?', 'Título del CTA del footer', 'text', 'textos', 3),
('cta_footer_subtitulo', 'Llevemos tu marca al siguiente nivel visual.', 'Subtítulo del CTA del footer', 'text', 'textos', 4);

-- ============================================
-- MIEMBROS DEL EQUIPO
-- ============================================

INSERT INTO public.equipo (nombre, rol, bio, imagen_url, instagram, linkedin, email, orden) VALUES
(
  'Lautaro López Labrin',
  'Co-Fundador & Director Creativo',
  'Apasionado por el diseño y la tecnología. Lidera la visión creativa de Quepia, transformando ideas en experiencias visuales memorables.',
  'https://placehold.co/400x500/1a1a1a/881078/png?text=Lautaro',
  'https://instagram.com/lautaro',
  'https://linkedin.com/in/lautaro',
  'lautaro@quepia.com',
  1
),
(
  'Camila De Angelis',
  'Co-Fundadora & Directora de Estrategia',
  'Especialista en branding y comunicación. Se encarga de que cada proyecto conecte emocionalmente con el público objetivo.',
  'https://placehold.co/400x500/1a1a1a/2AE7E4/png?text=Camila',
  'https://instagram.com/camila',
  'https://linkedin.com/in/camila',
  'camila@quepia.com',
  2
);

-- ============================================
-- ¡LISTO! Configuración insertada
-- ============================================
