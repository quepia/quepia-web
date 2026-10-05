-- PROPUESTA DE MIGRACIÓN, SIN APLICAR. No es requisito para publicar los casos.
-- Los slugs se derivan de título + UUID; no se agrega slug ni se modifica el sistema interno.
-- Las fechas históricas permanecen NULL: no se inventa una actualización al migrar.
BEGIN;
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS ciudad text;
ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE OR REPLACE FUNCTION public.touch_public_project_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF (NEW.titulo, NEW.descripcion, NEW.categoria, NEW.categorias, NEW.imagen_url,
      NEW.galeria_urls, NEW.destacado, NEW.orden, NEW.ciudad)
     IS DISTINCT FROM
     (OLD.titulo, OLD.descripcion, OLD.categoria, OLD.categorias, OLD.imagen_url,
      OLD.galeria_urls, OLD.destacado, OLD.orden, OLD.ciudad) THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS public_project_updated_at ON public.proyectos;
CREATE TRIGGER public_project_updated_at BEFORE UPDATE ON public.proyectos
FOR EACH ROW EXECUTE FUNCTION public.touch_public_project_updated_at();
ROLLBACK; -- Revisar y crear migración formal con CLI antes de aplicar con COMMIT.
