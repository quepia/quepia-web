-- Allow Telegram summary messages to be linked to a task without forcing a
-- specific asset/version. This keeps reply-to-feedback working for grouped
-- deliveries.

ALTER TABLE public.sistema_telegram_message_links
    ALTER COLUMN asset_id DROP NOT NULL,
    ALTER COLUMN asset_version_id DROP NOT NULL;

ALTER TABLE public.sistema_telegram_message_links
    ADD COLUMN IF NOT EXISTS message_scope TEXT NOT NULL DEFAULT 'asset'
        CHECK (message_scope IN ('asset', 'task_summary'));

UPDATE public.sistema_telegram_message_links
SET message_scope = 'asset'
WHERE message_scope IS NULL;

NOTIFY pgrst, 'reload schema';
