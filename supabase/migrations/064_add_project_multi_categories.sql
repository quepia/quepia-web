ALTER TABLE public.proyectos
ADD COLUMN IF NOT EXISTS categorias TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

UPDATE public.proyectos
SET categorias = ARRAY[categoria]
WHERE COALESCE(array_length(categorias, 1), 0) = 0
  AND categoria IS NOT NULL;
