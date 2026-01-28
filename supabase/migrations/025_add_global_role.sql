-- Add global role to sistema_users
ALTER TABLE sistema_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user', 'manager'));
