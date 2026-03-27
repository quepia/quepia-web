DO $$
BEGIN
  IF to_regclass('public.sistema_projects') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.sistema_projects DROP CONSTRAINT IF EXISTS sistema_projects_owner_id_fkey';
    EXECUTE 'ALTER TABLE public.sistema_projects
      ADD CONSTRAINT sistema_projects_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES public.sistema_users(id)
      ON DELETE RESTRICT';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_comments') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_comments'
        AND column_name = 'user_id'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_comments ALTER COLUMN user_id DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_comments DROP CONSTRAINT IF EXISTS sistema_comments_user_id_fkey';
      EXECUTE 'ALTER TABLE public.sistema_comments
        ADD CONSTRAINT sistema_comments_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_calendar_events') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_calendar_events'
        AND column_name = 'created_by'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_calendar_events ALTER COLUMN created_by DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_calendar_events DROP CONSTRAINT IF EXISTS sistema_calendar_events_created_by_fkey';
      EXECUTE 'ALTER TABLE public.sistema_calendar_events
        ADD CONSTRAINT sistema_calendar_events_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_assets') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_assets'
        AND column_name = 'created_by'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_assets ALTER COLUMN created_by DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_assets DROP CONSTRAINT IF EXISTS sistema_assets_created_by_fkey';
      EXECUTE 'ALTER TABLE public.sistema_assets
        ADD CONSTRAINT sistema_assets_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_asset_versions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_asset_versions'
        AND column_name = 'uploaded_by'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_asset_versions ALTER COLUMN uploaded_by DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_asset_versions DROP CONSTRAINT IF EXISTS sistema_asset_versions_uploaded_by_fkey';
      EXECUTE 'ALTER TABLE public.sistema_asset_versions
        ADD CONSTRAINT sistema_asset_versions_uploaded_by_fkey
        FOREIGN KEY (uploaded_by)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_approval_log') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_approval_log'
        AND column_name = 'changed_by'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_approval_log ALTER COLUMN changed_by DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_approval_log DROP CONSTRAINT IF EXISTS sistema_approval_log_changed_by_fkey';
      EXECUTE 'ALTER TABLE public.sistema_approval_log
        ADD CONSTRAINT sistema_approval_log_changed_by_fkey
        FOREIGN KEY (changed_by)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.sistema_project_templates') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'sistema_project_templates'
        AND column_name = 'created_by'
    ) THEN
      EXECUTE 'ALTER TABLE public.sistema_project_templates ALTER COLUMN created_by DROP NOT NULL';
      EXECUTE 'ALTER TABLE public.sistema_project_templates DROP CONSTRAINT IF EXISTS sistema_project_templates_created_by_fkey';
      EXECUTE 'ALTER TABLE public.sistema_project_templates
        ADD CONSTRAINT sistema_project_templates_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES public.sistema_users(id)
        ON DELETE SET NULL';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
