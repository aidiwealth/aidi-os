-- The investor page can show the group forecast (every company's forecast added together) instead of one forecast.
ALTER TABLE financials.public_pages ADD COLUMN IF NOT EXISTS forecast_group boolean NOT NULL DEFAULT false;
