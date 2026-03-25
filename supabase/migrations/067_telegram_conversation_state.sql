-- Estado de conversación para el wizard del bot de Telegram
-- Permite flujos guiados (ej: creación de tareas paso a paso)

CREATE TABLE IF NOT EXISTS sistema_telegram_conversation_state (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id     TEXT        NOT NULL,
  sender_id   TEXT        NOT NULL,
  step        TEXT        NOT NULL,
  context     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ DEFAULT (now() + interval '15 minutes'),
  UNIQUE (chat_id, sender_id)
);

ALTER TABLE sistema_telegram_conversation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
  ON sistema_telegram_conversation_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
