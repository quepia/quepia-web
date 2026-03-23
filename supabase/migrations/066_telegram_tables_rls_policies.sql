-- Add RLS policies for the Telegram tracking tables.
-- Without these policies, RLS blocks all non-service-role access.

-- ─── sistema_telegram_message_links ──────────────────────────────────────────

CREATE POLICY sistema_telegram_message_links_select
ON public.sistema_telegram_message_links
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_message_links_insert
ON public.sistema_telegram_message_links
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_message_links_update
ON public.sistema_telegram_message_links
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_message_links_delete
ON public.sistema_telegram_message_links
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

-- ─── sistema_telegram_inbound_updates ────────────────────────────────────────

CREATE POLICY sistema_telegram_inbound_updates_select
ON public.sistema_telegram_inbound_updates
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_inbound_updates_insert
ON public.sistema_telegram_inbound_updates
FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_inbound_updates_update
ON public.sistema_telegram_inbound_updates
FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

CREATE POLICY sistema_telegram_inbound_updates_delete
ON public.sistema_telegram_inbound_updates
FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.sistema_users u
        WHERE u.id = auth.uid() AND u.role = 'admin'
    )
);

NOTIFY pgrst, 'reload schema';
