-- Track outbound Telegram asset messages and inbound replies so feedback can be
-- mapped back to the exact task/asset/version in the system.

CREATE TABLE IF NOT EXISTS public.sistema_telegram_message_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    telegram_method TEXT NOT NULL DEFAULT 'message'
        CHECK (telegram_method IN ('message', 'document')),
    project_id UUID NOT NULL REFERENCES public.sistema_projects(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES public.sistema_tasks(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.sistema_assets(id) ON DELETE CASCADE,
    asset_version_id UUID NOT NULL REFERENCES public.sistema_asset_versions(id) ON DELETE CASCADE,
    actor_user_id UUID REFERENCES public.sistema_users(id) ON DELETE SET NULL,
    headline TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(chat_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_message_links_task
    ON public.sistema_telegram_message_links(task_id);

CREATE INDEX IF NOT EXISTS idx_telegram_message_links_asset
    ON public.sistema_telegram_message_links(asset_id);

CREATE INDEX IF NOT EXISTS idx_telegram_message_links_asset_version
    ON public.sistema_telegram_message_links(asset_version_id);

CREATE TABLE IF NOT EXISTS public.sistema_telegram_inbound_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id TEXT NOT NULL UNIQUE,
    chat_id TEXT,
    message_id TEXT,
    reply_to_message_id TEXT,
    sender_id TEXT,
    sender_name TEXT,
    content TEXT,
    status TEXT NOT NULL DEFAULT 'received'
        CHECK (status IN ('received', 'ignored', 'processed', 'failed')),
    error_message TEXT,
    raw_update JSONB,
    linked_message_id UUID REFERENCES public.sistema_telegram_message_links(id) ON DELETE SET NULL,
    comment_id UUID REFERENCES public.sistema_comments(id) ON DELETE SET NULL,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_inbound_updates_reply
    ON public.sistema_telegram_inbound_updates(chat_id, reply_to_message_id);

CREATE INDEX IF NOT EXISTS idx_telegram_inbound_updates_status
    ON public.sistema_telegram_inbound_updates(status);

ALTER TABLE public.sistema_telegram_message_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sistema_telegram_inbound_updates ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
