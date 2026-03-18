-- ============================================
-- QUEPIA - SEED DATA
-- Ejecutar en Supabase SQL Editor
-- ============================================

-- 1. Crear tablas si no existen
CREATE TABLE IF NOT EXISTS public.servicios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion_corta TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  icono TEXT NOT NULL DEFAULT 'Palette',
  categoria_trabajo TEXT,
  features TEXT[] DEFAULT '{}',
  orden INT DEFAULT 0,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.proyectos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  categoria TEXT NOT NULL,
  categorias TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  imagen_url TEXT,
  galeria_urls TEXT[] NOT NULL DEFAULT '{}',
  destacado BOOLEAN DEFAULT false,
  orden INT DEFAULT 0,
  fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.servicios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proyectos ENABLE ROW LEVEL SECURITY;

-- 3. Crear policies
DROP POLICY IF EXISTS "Public read servicios" ON public.servicios;
CREATE POLICY "Public read servicios" ON public.servicios FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth write servicios" ON public.servicios;
CREATE POLICY "Auth write servicios" ON public.servicios FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read proyectos" ON public.proyectos;
CREATE POLICY "Public read proyectos" ON public.proyectos FOR SELECT USING (true);

DROP POLICY IF EXISTS "Auth write proyectos" ON public.proyectos;
CREATE POLICY "Auth write proyectos" ON public.proyectos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Limpiar datos existentes
DELETE FROM public.servicios;
DELETE FROM public.proyectos;

-- ============================================
-- SERVICIOS (9 servicios)
-- ============================================

INSERT INTO public.servicios (titulo, descripcion_corta, descripcion, icono, categoria_trabajo, features, orden) VALUES
(
  'Diseño Gráfico',
  'Creamos piezas visuales impactantes.',
  'Desarrollamos identidades visuales completas, desde logotipos hasta materiales de marketing. Nuestro equipo combina creatividad y estrategia para crear diseños que comunican efectivamente tu mensaje y conectan con tu audiencia.',
  'Palette',
  'diseno-grafico',
  ARRAY['Diseño de logotipos', 'Material impreso', 'Diseño editorial', 'Ilustración digital', 'Infografías'],
  1
),
(
  'Branding',
  'Identidad visual coherente.',
  'Construimos marcas memorables que conectan emocionalmente con tu público. Definimos personalidad de marca, tono de comunicación, paleta de colores y todos los elementos que hacen única tu identidad.',
  'Layers',
  'branding',
  ARRAY['Identidad visual', 'Manual de marca', 'Naming', 'Estrategia de marca', 'Rebranding'],
  2
),
(
  'Gestión de Redes Sociales',
  'Estrategia digital para tu marca.',
  'Gestionamos tus redes sociales con contenido estratégico y creativo. Creamos calendarios de publicación, diseñamos posts atractivos y analizamos métricas para optimizar el alcance y engagement de tu comunidad.',
  'Megaphone',
  'redes-sociales',
  ARRAY['Estrategia de contenido', 'Diseño de posts', 'Community management', 'Análisis de métricas', 'Campañas pagadas'],
  3
),
(
  'Producción de Video',
  'Narrativas cinematográficas para tu marca.',
  'Producimos contenido audiovisual de alta calidad: spots publicitarios, videos corporativos, contenido para redes sociales y más. Cada proyecto cuenta una historia que captura la esencia de tu marca.',
  'Video',
  'video',
  ARRAY['Spots publicitarios', 'Videos corporativos', 'Reels y TikToks', 'Motion graphics', 'Drone FPV'],
  4
),
(
  'Fotografía',
  'Imágenes de alto impacto.',
  'Realizamos sesiones fotográficas profesionales para productos, campañas publicitarias, retratos corporativos y estilo de vida. Capturamos la esencia visual que tu marca necesita para destacar.',
  'Camera',
  'fotografia',
  ARRAY['Fotografía de producto', 'Retratos corporativos', 'Lifestyle', 'Eventos', 'Edición profesional'],
  5
),
(
  'Diseño de Packaging',
  'Envases que venden.',
  'Creamos packaging innovador que destaca en el punto de venta. Combinamos funcionalidad, sustentabilidad y diseño atractivo para que tu producto se distinga de la competencia.',
  'Package',
  'packaging',
  ARRAY['Diseño estructural', 'Etiquetas', 'Cajas y envases', 'Packaging sustentable', 'Mockups 3D'],
  6
),
(
  'Cartelería',
  'Soluciones visuales de gran formato.',
  'Diseñamos y producimos cartelería impactante para puntos de venta, eventos y espacios comerciales. Trabajamos con diversos materiales y técnicas para maximizar la visibilidad de tu marca.',
  'PenTool',
  'carteleria',
  ARRAY['Señalética', 'Vinilos', 'Banners', 'Displays', 'Rotulación vehicular'],
  7
),
(
  'Marketing',
  'Estrategias que generan resultados.',
  'Desarrollamos campañas de marketing integrales que combinan canales digitales y tradicionales. Desde la planificación estratégica hasta la ejecución, nos enfocamos en alcanzar tus objetivos comerciales.',
  'Megaphone',
  'marketing',
  ARRAY['Marketing digital', 'Email marketing', 'SEO/SEM', 'Publicidad tradicional', 'Estrategia 360°'],
  8
),
(
  'Diseño de Productos y Procesos',
  'Conceptualización y desarrollo integral.',
  'Diseñamos productos funcionales y estéticos, optimizando procesos de producción. Desde el concepto inicial hasta el prototipo final, acompañamos cada etapa del desarrollo con un enfoque centrado en el usuario.',
  'Layout',
  'productos',
  ARRAY['Conceptualización', 'Prototipado', 'Diseño industrial', 'Optimización de procesos', 'UX/UI'],
  9
);

-- ============================================
-- PROYECTOS DE EJEMPLO (6 por categoría)
-- ============================================

-- BRANDING
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Identidad Corporativa Café del Valle', 'Desarrollo completo de identidad visual para cafetería local', 'branding', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Branding+1', true, 1),
('Manual de Marca TechStart', 'Manual de marca integral para startup tecnológica', 'branding', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Branding+2', false, 2),
('Rebranding Restaurante Aurora', 'Renovación de identidad visual completa', 'branding', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Branding+3', false, 3),
('Papelería Corporativa Estudio Legal', 'Diseño de papelería institucional premium', 'branding', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Branding+4', false, 4),
('Branding Tienda de Moda', 'Identidad vibrante para boutique de moda', 'branding', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Branding+5', false, 5),
('Identidad Digital App Fitness', 'Branding digital para aplicación móvil', 'branding', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Branding+6', false, 6);

-- DISEÑO GRÁFICO
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Logotipo Cervecería Artesanal', 'Diseño de logotipo con estilo vintage', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Grafico+1', true, 1),
('Flyers Festival de Música', 'Campaña gráfica para evento musical', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Grafico+2', false, 2),
('Catálogo de Productos', 'Diseño editorial para catálogo corporativo', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Grafico+3', false, 3),
('Infografía Sostenibilidad', 'Visualización de datos para ONG ambiental', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Grafico+4', false, 4),
('Ilustración Digital', 'Serie de ilustraciones para campaña', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Grafico+5', false, 5),
('Diseño Editorial Revista', 'Maquetación de revista cultural', 'diseno-grafico', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Grafico+6', false, 6);

-- FOTOGRAFÍA
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Fotografía Gastronómica', 'Sesión para menú de restaurante gourmet', 'fotografia', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Foto+1', true, 1),
('Lifestyle Moda Primavera', 'Campaña lifestyle para colección de ropa', 'fotografia', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Foto+2', false, 2),
('Retratos Corporativos', 'Fotografía ejecutiva para empresa', 'fotografia', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Foto+3', false, 3),
('Cobertura de Evento', 'Fotografía de evento corporativo', 'fotografia', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Foto+4', false, 4),
('Producto E-commerce', 'Fotografía para tienda online', 'fotografia', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Foto+5', false, 5),
('Arquitectura Interior', 'Fotografía de espacios comerciales', 'fotografia', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Foto+6', false, 6);

-- VIDEO
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Spot Publicitario TV', 'Comercial de televisión para marca nacional', 'video', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Video+1', true, 1),
('Video Corporativo', 'Presentación institucional de empresa', 'video', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Video+2', false, 2),
('Reels Instagram', 'Contenido para redes sociales', 'video', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Video+3', false, 3),
('Motion Graphics', 'Animación para presentación de producto', 'video', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Video+4', false, 4),
('Drone FPV Inmobiliaria', 'Video aéreo para proyecto inmobiliario', 'video', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Video+5', false, 5),
('Mini Documental', 'Historia de marca en formato documental', 'video', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Video+6', false, 6);

-- REDES SOCIALES
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Feed Instagram Completo', 'Diseño de grilla visual para marca', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Social+1', true, 1),
('Historias Destacadas', 'Diseño de covers para stories', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Social+2', false, 2),
('Campaña Lanzamiento', 'Contenido para lanzamiento de producto', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Social+3', false, 3),
('Contenido TikTok', 'Estrategia y contenido para TikTok', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Social+4', false, 4),
('LinkedIn Corporativo', 'Contenido profesional para empresa', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Social+5', false, 5),
('Campaña Navideña', 'Contenido temático para fin de año', 'redes-sociales', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Social+6', false, 6);

-- PACKAGING
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Caja Premium Vinos', 'Packaging de lujo para bodega', 'packaging', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Pack+1', true, 1),
('Etiquetas Cerveza Artesanal', 'Sistema de etiquetas para variedades', 'packaging', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Pack+2', false, 2),
('Bolsas Ecológicas', 'Packaging sustentable para tienda', 'packaging', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Pack+3', false, 3),
('Envase Producto Gourmet', 'Diseño de envase para alimentos', 'packaging', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Pack+4', false, 4),
('Display Punto de Venta', 'Exhibidor de producto para retail', 'packaging', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Pack+5', false, 5),
('Packaging Eco-Friendly', 'Línea de productos sustentables', 'packaging', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Pack+6', false, 6);

-- CARTELERÍA
INSERT INTO public.proyectos (titulo, descripcion, categoria, imagen_url, destacado, orden) VALUES
('Señalética Centro Comercial', 'Sistema de señalización completo', 'carteleria', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Cartel+1', true, 1),
('Vinilos Vidriera', 'Diseño de vinilos para local comercial', 'carteleria', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Cartel+2', false, 2),
('Banners Evento', 'Cartelería para feria empresarial', 'carteleria', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Cartel+3', false, 3),
('Cartel Luminoso', 'Diseño de cartel frontlight', 'carteleria', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Cartel+4', false, 4),
('Rotulación Vehicular', 'Ploteo de flota de vehículos', 'carteleria', 'https://placehold.co/800x600/1a1a1a/881078/png?text=Cartel+5', false, 5),
('Fachada Restaurante', 'Diseño integral de fachada comercial', 'carteleria', 'https://placehold.co/800x600/1a1a1a/2AE7E4/png?text=Cartel+6', false, 6);

UPDATE public.proyectos
SET categorias = ARRAY[categoria]
WHERE COALESCE(array_length(categorias, 1), 0) = 0
  AND categoria IS NOT NULL;

-- ============================================
-- ¡LISTO! Datos insertados correctamente
-- ============================================
