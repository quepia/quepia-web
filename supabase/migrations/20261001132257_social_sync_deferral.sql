-- La reserva de cuota es una pausa, no un fallo del trabajo.
CREATE OR REPLACE FUNCTION public.social_defer_job(
  p_job_id UUID, p_worker TEXT, p_error TEXT, p_retry_after_seconds INTEGER DEFAULT 60
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.sistema_social_jobs SET
    status = 'queued', attempts = GREATEST(0, attempts - 1),
    last_error = left(p_error, 2000), locked_by = NULL, lease_expires_at = NULL,
    run_after = now() + make_interval(secs => GREATEST(1, COALESCE(p_retry_after_seconds, 60))),
    finished_at = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'running' AND locked_by = p_worker;
  IF NOT FOUND THEN
    RETURN private.social_error('lease_lost', 'El trabajo ya no pertenece a este worker');
  END IF;
  RETURN private.social_ok(jsonb_build_object('id', p_job_id, 'status', 'queued'));
END;
$$;
REVOKE ALL ON FUNCTION public.social_defer_job(UUID,TEXT,TEXT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_defer_job(UUID,TEXT,TEXT,INTEGER) TO service_role;
