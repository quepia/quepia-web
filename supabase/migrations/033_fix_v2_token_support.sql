-- Migration 033: Fix V2 Session Token Support for Comments, Asset Status & Annotations
--
-- Problem: public_add_calendar_comment, public_update_asset_status, and
-- public_add_asset_annotation only accept V1 tokens (access_token text).
-- V2 clients use session UUIDs (36-char) which don't match access_token values.
--
-- Solution: Each function now tries V1 first, then falls back to V2 session lookup.

-- Helper: Resolve token to access_record (supports both V1 and V2)
CREATE OR REPLACE FUNCTION _resolve_client_token(p_token text)
RETURNS sistema_client_access
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record sistema_client_access%ROWTYPE;
    session_record record;
BEGIN
    -- Try V1: direct access_token match
    SELECT * INTO access_record
    FROM sistema_client_access
    WHERE access_token = p_token
    AND (expires_at IS NULL OR expires_at > NOW());

    IF access_record IS NOT NULL THEN
        RETURN access_record;
    END IF;

    -- Try V2: session token (UUID format, 36 chars)
    IF length(p_token) = 36 THEN
        BEGIN
            SELECT * INTO session_record
            FROM sistema_client_sessions
            WHERE id = p_token::uuid
            AND expires_at > NOW();

            IF session_record IS NOT NULL THEN
                -- Update session activity
                UPDATE sistema_client_sessions
                SET last_accessed_at = NOW()
                WHERE id = p_token::uuid;

                -- Get the associated access record
                SELECT * INTO access_record
                FROM sistema_client_access
                WHERE id = session_record.client_access_id;

                RETURN access_record;
            END IF;
        EXCEPTION WHEN invalid_text_representation THEN
            -- p_token is not a valid UUID, ignore
            NULL;
        END;
    END IF;

    -- Neither matched
    RETURN NULL;
END;
$$;


-- 1. Fix public_add_calendar_comment to support V1 + V2 tokens
CREATE OR REPLACE FUNCTION public_add_calendar_comment(
  token text,
  event_id uuid,
  content text,
  author_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  access_record sistema_client_access%ROWTYPE;
  event_record record;
BEGIN
  -- Resolve token (V1 or V2)
  access_record := _resolve_client_token(token);

  IF access_record IS NULL THEN
    RETURN json_build_object('error', 'Invalid or expired token');
  END IF;

  IF NOT access_record.can_comment THEN
    RETURN json_build_object('error', 'Commenting not allowed');
  END IF;

  -- Verify event belongs to the project
  SELECT * INTO event_record
  FROM sistema_calendar_events
  WHERE id = event_id
  AND project_id = access_record.project_id;

  IF event_record IS NULL THEN
     RETURN json_build_object('error', 'Event not found or access denied');
  END IF;

  -- Insert comment
  INSERT INTO sistema_calendar_comments (event_id, content, created_at, author_name, is_client)
  VALUES (event_id, content, NOW(), author_name, TRUE);

  RETURN json_build_object('success', TRUE);
END;
$$;


-- 2. Fix public_update_asset_status to support V1 + V2 tokens
CREATE OR REPLACE FUNCTION public_update_asset_status(
    token text,
    asset_id uuid,
    status text,
    rating integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record sistema_client_access%ROWTYPE;
    asset_record record;
BEGIN
    -- Resolve token (V1 or V2)
    access_record := _resolve_client_token(token);

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Verify asset belongs to project
    SELECT * INTO asset_record
    FROM sistema_assets
    WHERE id = asset_id
    AND project_id = access_record.project_id;

    IF asset_record IS NULL THEN
        RETURN json_build_object('error', 'Asset not found or access denied');
    END IF;

    -- Update asset
    UPDATE sistema_assets
    SET
        approval_status = status,
        client_rating = COALESCE(rating, client_rating),
        updated_at = NOW()
    WHERE id = asset_id;

    RETURN json_build_object('success', TRUE);
END;
$$;


-- 3. Fix public_add_asset_annotation to support V1 + V2 tokens
CREATE OR REPLACE FUNCTION public_add_asset_annotation(
    token text,
    asset_version_id uuid,
    x_percent numeric,
    y_percent numeric,
    content text,
    feedback_type text DEFAULT 'correction_minor',
    author_name text DEFAULT 'Client'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    access_record sistema_client_access%ROWTYPE;
    version_record record;
    new_id uuid;
BEGIN
    -- Resolve token (V1 or V2)
    access_record := _resolve_client_token(token);

    IF access_record IS NULL THEN
        RETURN json_build_object('error', 'Invalid or expired token');
    END IF;

    -- Verify version -> asset -> project
    SELECT av.id
    INTO version_record
    FROM sistema_asset_versions av
    JOIN sistema_assets a ON a.id = av.asset_id
    WHERE av.id = asset_version_id
    AND a.project_id = access_record.project_id;

    IF version_record IS NULL THEN
        RETURN json_build_object('error', 'Asset version not found or access denied');
    END IF;

    -- Insert annotation
    INSERT INTO sistema_annotations (
        asset_version_id,
        x_percent,
        y_percent,
        feedback_type,
        contenido,
        author_name,
        created_at
    ) VALUES (
        asset_version_id,
        x_percent,
        y_percent,
        feedback_type,
        content,
        author_name,
        NOW()
    ) RETURNING id INTO new_id;

    RETURN json_build_object('success', TRUE, 'id', new_id);
END;
$$;
