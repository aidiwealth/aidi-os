-- 026_investor_page.sql — each company's public investor page.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.public_pages (
  organization_id  uuid        PRIMARY KEY DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  slug             text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  published        boolean     NOT NULL DEFAULT false,
  headline         text        CHECK (length(headline) <= 200),
  about            text        CHECK (length(about) <= 3000),
  website          text        CHECK (length(website) <= 300),
  deck_url         text        CHECK (length(deck_url) <= 500),
  contact_email    text        CHECK (length(contact_email) <= 254),
  metrics          text[]      NOT NULL DEFAULT '{revenue,gross_margin,net_income,cash}',
  period_type      text        NOT NULL DEFAULT 'month' CHECK (period_type IN ('month','quarter','year')),
  views            integer     NOT NULL DEFAULT 0,
  last_viewed_at   timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE financials.public_pages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.public_pages;
CREATE POLICY tenant_isolation ON financials.public_pages USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.public_pages TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'investor_page') WHERE code IN ('company_free','company_startup','company_scale','internal') AND NOT ('investor_page' = ANY(modules));
COMMIT;
