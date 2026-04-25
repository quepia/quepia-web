-- Add multi-category support to portfolio projects.
-- Run this once in the Supabase SQL editor if the admin shows
-- "column proyectos.categorias does not exist".

ALTER TABLE public.proyectos
ADD COLUMN IF NOT EXISTS categorias TEXT[] DEFAULT '{}'::TEXT[];

UPDATE public.proyectos
SET categorias = ARRAY[categoria]
WHERE categoria IS NOT NULL
  AND btrim(categoria) <> ''
  AND (categorias IS NULL OR array_length(categorias, 1) IS NULL);

UPDATE public.proyectos
SET categorias = '{}'::TEXT[]
WHERE categorias IS NULL;

ALTER TABLE public.proyectos
ALTER COLUMN categorias SET DEFAULT '{}'::TEXT[],
ALTER COLUMN categorias SET NOT NULL;
