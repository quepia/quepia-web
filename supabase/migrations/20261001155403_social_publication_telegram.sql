-- Durable, server-only notices. No historical backfill: starts with new confirmations.
CREATE TABLE public.sistema_publication_telegram_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.sistema_zernio_publications(id) ON DELETE CASCADE,
  account_id text NOT NULL,
  platform text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  leased_at timestamptz,
  sent_at timestamptz,
  error_message text,
  UNIQUE(publication_id, account_id, platform)
);
ALTER TABLE public.sistema_publication_telegram_notices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sistema_publication_telegram_notices FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sistema_publication_telegram_notices TO service_role;
CREATE INDEX publication_telegram_pending ON public.sistema_publication_telegram_notices(next_attempt_at) WHERE status <> 'sent';

CREATE OR REPLACE FUNCTION private.enqueue_publication_telegram_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE entry jsonb; account_ref text; prior jsonb; task_title text; project_name text;
BEGIN
  IF NEW.zernio_post_id IS NULL THEN RETURN NEW; END IF;
  prior := CASE WHEN TG_OP = 'UPDATE' THEN OLD.platform_results ELSE '[]'::jsonb END;
  SELECT titulo INTO task_title FROM public.sistema_tasks WHERE id = NEW.task_id;
  SELECT nombre INTO project_name FROM public.sistema_projects WHERE id = NEW.project_id;
  FOR entry IN SELECT value FROM jsonb_array_elements(COALESCE(NEW.platform_results, '[]'::jsonb)) LOOP
    IF entry->>'status' <> 'published' OR entry->>'status' IS NULL THEN CONTINUE; END IF;
    account_ref := COALESCE(entry->'accountId'->>'_id', entry->'accountId'->>'id', entry->>'accountId');
    IF account_ref IS NULL OR entry->>'platform' IS NULL THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(prior, '[]'::jsonb)) previous
      WHERE previous->>'status' = 'published' AND previous->>'platform' = entry->>'platform'
        AND COALESCE(previous->'accountId'->>'_id', previous->'accountId'->>'id', previous->>'accountId') = account_ref
    ) THEN CONTINUE; END IF;
    INSERT INTO public.sistema_publication_telegram_notices(publication_id, account_id, platform, payload)
    VALUES (NEW.id, account_ref, entry->>'platform', jsonb_build_object(
      'task', task_title, 'project', project_name,
      'account', COALESCE(entry->'accountId'->>'displayName', entry->'accountId'->>'username', account_ref),
      'published_at', entry->>'publishedAt', 'url', entry->>'platformPostUrl'
    )) ON CONFLICT(publication_id, account_id, platform) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.enqueue_publication_telegram_notice() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.enqueue_publication_telegram_notice() TO service_role;
CREATE TRIGGER publication_telegram_confirmation
AFTER INSERT OR UPDATE OF platform_results ON public.sistema_zernio_publications
FOR EACH ROW EXECUTE FUNCTION private.enqueue_publication_telegram_notice();

CREATE OR REPLACE FUNCTION public.claim_publication_telegram_notices(p_limit integer DEFAULT 3)
RETURNS SETOF public.sistema_publication_telegram_notices
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.sistema_publication_telegram_notices notice
  SET status = 'sending', attempts = attempts + 1, leased_at = now(), lease_token = gen_random_uuid()
  WHERE notice.id IN (
    SELECT id FROM public.sistema_publication_telegram_notices
    WHERE (status = 'pending' AND next_attempt_at <= now())
       OR (status = 'sending' AND leased_at < now() - interval '5 minutes')
    ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT greatest(1, least(p_limit, 10))
  ) RETURNING notice.*;
$$;
REVOKE ALL ON FUNCTION public.claim_publication_telegram_notices(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publication_telegram_notices(integer) TO service_role;
