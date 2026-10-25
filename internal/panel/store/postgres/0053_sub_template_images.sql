-- +goose Up
-- The page's templates have images of their own: bg-<x> backgrounds and banner-<x>
-- pictures, besides the logo and the old background (subpage.AssetLimit).
ALTER TABLE sub_assets DROP CONSTRAINT sub_assets_name_check;
ALTER TABLE sub_assets ADD CONSTRAINT sub_assets_name_check
  CHECK (name IN ('logo','background') OR name ~ '^bg-[a-z0-9-]{1,24}$' OR name ~ '^banner-[a-z0-9-]{1,40}$');

-- +goose Down
DELETE FROM sub_assets WHERE name NOT IN ('logo','background');
ALTER TABLE sub_assets DROP CONSTRAINT sub_assets_name_check;
ALTER TABLE sub_assets ADD CONSTRAINT sub_assets_name_check CHECK (name IN ('logo','background'));
