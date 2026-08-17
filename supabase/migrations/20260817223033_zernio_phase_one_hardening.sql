-- Make the server-only access model explicit and cover the remaining foreign keys.

CREATE INDEX IF NOT EXISTS idx_zernio_profiles_created_by
  ON public.sistema_zernio_profiles(created_by);

CREATE INDEX IF NOT EXISTS idx_zernio_publications_created_by
  ON public.sistema_zernio_publications(created_by);

CREATE POLICY "Zernio profiles are server only"
  ON public.sistema_zernio_profiles
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Zernio accounts are server only"
  ON public.sistema_zernio_accounts
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Zernio publications are server only"
  ON public.sistema_zernio_publications
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
