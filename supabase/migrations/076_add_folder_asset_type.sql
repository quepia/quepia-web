-- Migration 076: Allow Drive folder links as first-class task assets

ALTER TABLE sistema_assets
  DROP CONSTRAINT IF EXISTS sistema_assets_asset_type_check;

ALTER TABLE sistema_assets
  ADD CONSTRAINT sistema_assets_asset_type_check
  CHECK (asset_type IN ('single', 'carousel', 'reel', 'folder'));

NOTIFY pgrst, 'reload schema';
