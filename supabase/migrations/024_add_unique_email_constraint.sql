-- Add unique constraint to email in sistema_users
ALTER TABLE sistema_users ADD CONSTRAINT system_users_email_key UNIQUE (email);
