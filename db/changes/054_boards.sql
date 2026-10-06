-- 054_boards.sql — financial boards (per audience) with private share links.
BEGIN;
CREATE TABLE IF NOT EXISTS financials.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  audience text NOT NULL CHECK (audience IN ('cfo','executive','team','investor','custom')), name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80), sort integer NOT NULL DEFAULT 0,
  kpis text[] NOT NULL DEFAULT '{}', charts jsonb NOT NULL DEFAULT '[]'::jsonb, period text NOT NULL DEFAULT 'month' CHECK (period IN ('month','quarter','year')), count integer NOT NULL DEFAULT 12 CHECK (count BETWEEN 2 AND 36),
  note text CHECK (length(note) <= 1000), share_token text UNIQUE, share_enabled boolean NOT NULL DEFAULT false, share_expires timestamptz, views integer NOT NULL DEFAULT 0, last_viewed_at timestamptz,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE financials.boards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.boards;
CREATE POLICY tenant_isolation ON financials.boards USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.boards TO aidi_os_app;
COMMIT;
