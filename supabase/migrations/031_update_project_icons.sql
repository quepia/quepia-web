-- Remove the check constraint on icon column to allow new icon types (laptop, etc.)
ALTER TABLE sistema_projects DROP CONSTRAINT IF EXISTS sistema_projects_icon_check;
