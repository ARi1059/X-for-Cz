-- A tiny inline WebP used as the public loading placeholder.
-- It is stored with the private derivative and never fetched as a separate media request.
ALTER TABLE media_assets ADD COLUMN lqip TEXT;
