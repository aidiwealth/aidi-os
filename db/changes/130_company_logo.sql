-- 130_company_logo.sql — one company logo, set in Settings: move investor page logos into the branding logo where
-- none is set yet. Data only; no schema change.
BEGIN;
INSERT INTO fundraise.brand (organization_id, logo_id)
SELECT DISTINCT ON (p.organization_id) p.organization_id, p.logo_id FROM financials.public_pages p WHERE p.logo_id IS NOT NULL
ON CONFLICT (organization_id) DO UPDATE SET logo_id = EXCLUDED.logo_id, updated_at = now() WHERE fundraise.brand.logo_id IS NULL;
COMMIT;
