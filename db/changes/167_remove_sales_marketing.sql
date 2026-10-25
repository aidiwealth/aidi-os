-- 167_remove_sales_marketing.sql — Finvry no longer has Sales or Marketing. Run by hand on the live database AFTER the
-- code without them is deployed, and after the backup:
--   pg_dump "$ADMIN_DATABASE_URL" -n growth -Fc -f growth-backup-$(date +%F).dump
-- What stays: growth.links and growth.pending_imports, which Banking uses for linked bank sheets and imports.
-- Every statement is safe to run twice.
BEGIN;

-- 1. Sales and Marketing data (deals, their stage history, campaigns, channel results, processes).
DROP TABLE IF EXISTS growth.deal_moves;
DROP TABLE IF EXISTS growth.deals;
DROP TABLE IF EXISTS growth.campaigns;
DROP TABLE IF EXISTS growth.channel_months;

-- 2. Imports and links: only bank ones stay. CRM connections (HubSpot, Pipedrive) go with their stored tokens.
DELETE FROM growth.pending_imports WHERE kind IN ('sales_deals', 'marketing_months');
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'growth' AND table_name = 'links' AND column_name = 'source') THEN
    DELETE FROM growth.links WHERE kind IN ('sales_deals', 'marketing_months') OR source <> 'sheet';
  ELSE
    DELETE FROM growth.links WHERE kind IN ('sales_deals', 'marketing_months');
  END IF;
END $$;
ALTER TABLE growth.pending_imports DROP COLUMN IF EXISTS process_id;
ALTER TABLE growth.links DROP COLUMN IF EXISTS process_id;
ALTER TABLE growth.links DROP COLUMN IF EXISTS secret_enc;
ALTER TABLE growth.links DROP COLUMN IF EXISTS source;
ALTER TABLE growth.links DROP CONSTRAINT IF EXISTS links_kind_check;
ALTER TABLE growth.links ADD CONSTRAINT links_kind_check CHECK (kind = 'bank_txns');
ALTER TABLE growth.pending_imports DROP CONSTRAINT IF EXISTS pending_imports_kind_check;
ALTER TABLE growth.pending_imports ADD CONSTRAINT pending_imports_kind_check CHECK (kind = 'bank_txns');
DROP TABLE IF EXISTS growth.processes;

-- 3. Plans (Startup, Medium, Scale and any other), switched modules and workspace settings.
UPDATE core.plans SET modules = array_remove(array_remove(modules, 'sales'), 'marketing') WHERE modules && ARRAY['sales', 'marketing'];
DELETE FROM core.modules WHERE code IN ('sales', 'marketing');
UPDATE core.organizations SET settings = jsonb_set(settings, '{extra_modules}',
    (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM jsonb_array_elements(settings->'extra_modules') x WHERE x #>> '{}' NOT IN ('sales', 'marketing')))
  WHERE jsonb_typeof(settings->'extra_modules') = 'array' AND settings->'extra_modules' ?| ARRAY['sales', 'marketing'];
UPDATE core.organizations SET settings = jsonb_set(settings, '{module_roles}', (settings->'module_roles') - 'sales' - 'marketing')
  WHERE jsonb_typeof(settings->'module_roles') = 'object' AND settings->'module_roles' ?| ARRAY['sales', 'marketing'];
UPDATE core.organizations o SET settings = jsonb_set(o.settings, '{member_modules}', (
    SELECT coalesce(jsonb_object_agg(m.key, CASE WHEN jsonb_typeof(m.value) = 'array' THEN (SELECT coalesce(jsonb_agg(c), '[]'::jsonb) FROM jsonb_array_elements(m.value) c WHERE c #>> '{}' NOT IN ('sales', 'marketing')) ELSE m.value END), '{}'::jsonb)
      FROM jsonb_each(o.settings->'member_modules') m))
  WHERE jsonb_typeof(o.settings->'member_modules') = 'object';

COMMIT;
