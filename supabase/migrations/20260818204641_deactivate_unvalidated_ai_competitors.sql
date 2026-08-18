BEGIN;

-- Older intelligence runs persisted AI discoveries as active competitors even
-- though the UI marked them as requiring human validation. Keep the records
-- recoverable, but remove them from active project and MCP context until a
-- person explicitly confirms the competitor.
UPDATE public.sistema_competitors
SET is_active = FALSE,
    updated_at = NOW()
WHERE is_active = TRUE
  AND notes = 'Competidor descubierto por la investigación de IA. Requiere validación del equipo.';

COMMIT;
