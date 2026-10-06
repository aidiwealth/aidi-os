-- 051_valuations_blog.sql — Angel Fund marks at the latest known valuations; blog posts.
BEGIN;
CREATE SCHEMA IF NOT EXISTS content;
GRANT USAGE ON SCHEMA content TO aidi_os_app;
CREATE TABLE IF NOT EXISTS content.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,118}$'), title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200), description text CHECK (length(description) <= 500),
  tag text CHECK (length(tag) <= 60), body text NOT NULL DEFAULT '' CHECK (length(body) <= 200000), cover_id uuid, author_name text CHECK (length(author_name) <= 120),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')), featured boolean NOT NULL DEFAULT false, sort integer NOT NULL DEFAULT 0, published_at timestamptz,
  seo_title text CHECK (length(seo_title) <= 200), seo_description text CHECK (length(seo_description) <= 300), source text, created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (organization_id, slug));
ALTER TABLE content.posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON content.posts;
CREATE POLICY tenant_isolation ON content.posts USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON content.posts TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'blog') WHERE code = 'internal' AND NOT ('blog' = ANY(modules));

-- Angel Fund: mark SAFE positions at the latest known valuation (value = invested x valuation / cap)
CREATE TEMP TABLE v (nm text, val numeric, note text) ON COMMIT DROP;
INSERT INTO v VALUES ('CreditChek', 5000000, 'Last known valuation $5,000,000 (new funding).'), ('PayHippo', 30000000, 'Last known valuation $30,000,000 (Rivy); needs an update.'),
  ('Nigenius', 1304431, 'Last known valuation $1,304,431 (new funding).'), ('Bumpa', 15000000, 'Last known valuation $15,000,000 (new funding).'),
  ('Moni (Rank Capital Inc.)', 48000000, 'Last known valuation $48,000,000 (new funding).'), ('Grey Inc.', 30000000, 'Last known valuation $30,000,000 (new funding).'),
  ('Mercury', 5200000000, 'Last known valuation $5,200,000,000.'), ('Formal (Maytana Inc.)', 200000000, 'Last known valuation $200,000,000 (after Aidi exited for $65,000).');
UPDATE wealth.holdings SET status = 'active', notes = replace(coalesce(notes, ''), ' Company folded; written off.', '') WHERE name = 'PayHippo' AND section = 'venture' AND status = 'written_off';
INSERT INTO wealth.valuations (organization_id, holding_id, as_of, value, note)
  SELECT h.organization_id, h.id, current_date, round(h.cost * v.val / (h.meta->>'post_money_cap')::numeric, 2), v.note FROM wealth.holdings h JOIN v ON v.nm = h.name
  WHERE h.section = 'venture' AND h.status IN ('active', 'at_cost') AND (h.meta->>'post_money_cap') IS NOT NULL AND h.cost > 0 AND coalesce(h.meta->>'last_valuation', '') <> v.val::text;
UPDATE wealth.holdings h SET current_value = CASE WHEN h.status IN ('active', 'at_cost') AND (h.meta->>'post_money_cap') IS NOT NULL AND h.cost > 0 THEN round(h.cost * v.val / (h.meta->>'post_money_cap')::numeric, 2) ELSE h.current_value END,
  status = CASE WHEN h.status = 'at_cost' THEN 'active' ELSE h.status END,
  meta = h.meta || jsonb_build_object('last_valuation', v.val, 'valuation_date', current_date::text, 'valuation_note', v.note), as_of = current_date,
  notes = CASE WHEN coalesce(h.notes, '') LIKE '%' || v.note || '%' THEN h.notes ELSE trim(coalesce(h.notes, '') || ' ' || v.note) END, updated_at = now()
  FROM v WHERE v.nm = h.name AND h.section = 'venture';
UPDATE wealth.holdings SET meta = meta || jsonb_build_object('aidi_share_pct', round((meta->>'aidi_angel_fund')::numeric / cost * 100, 2))
  WHERE section = 'venture' AND cost > 0 AND (meta->>'aidi_angel_fund') IS NOT NULL;
-- the firm's share of the unrealized portfolio (management basis) and the conservative NAV line (30% haircut)
UPDATE wealth.holdings n SET meta = n.meta || jsonb_build_object('mgmt_value', s.mgmt), current_value = round(s.mgmt * 0.7, 2), as_of = current_date, updated_at = now()
  FROM (SELECT organization_id, round(sum(coalesce((meta->>'aidi_share_pct')::numeric, 0) / 100 * coalesce(current_value, 0)), 2) AS mgmt FROM wealth.holdings WHERE section = 'venture' AND status IN ('active', 'at_cost') GROUP BY organization_id) s
  WHERE n.organization_id = s.organization_id AND n.name = 'Aidi Angel Fund portfolio: Aidi (firm) share, unrealized';
COMMIT;
