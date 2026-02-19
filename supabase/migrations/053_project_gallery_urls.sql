ALTER TABLE public.proyectos
ADD COLUMN IF NOT EXISTS galeria_urls TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

UPDATE public.proyectos
SET galeria_urls = ARRAY[imagen_url]
WHERE imagen_url IS NOT NULL
  AND COALESCE(array_length(galeria_urls, 1), 0) = 0;
