-- Estas funciones son SECURITY DEFINER y usan referencias calificadas.
-- Fijar un search_path vacío evita que objetos inyectados en otros schemas
-- puedan alterar su resolución de nombres.
ALTER FUNCTION public.get_accounting_payments(INTEGER, INTEGER, UUID, VARCHAR, UUID)
  SET search_path = '';

ALTER FUNCTION public.get_account_movements(UUID, INTEGER)
  SET search_path = '';

ALTER FUNCTION public.get_unified_history(DATE, DATE, UUID, VARCHAR, INTEGER, INTEGER)
  SET search_path = '';
