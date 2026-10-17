-- Exit planning per cap table: potential buyers (found with AI, kept and worked like a short list) and the scenario
-- assumptions (what the exit value is based on, and the worst / base / best multiples).
CREATE TABLE IF NOT EXISTS equity.exit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL UNIQUE REFERENCES equity.captables(id) ON DELETE CASCADE,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb, buyers jsonb NOT NULL DEFAULT '[]'::jsonb, searched_at timestamptz,
  -- The buyer search runs in the background (it can take a couple of minutes); the page follows it here.
  search_status text NOT NULL DEFAULT 'idle' CHECK (search_status IN ('idle', 'running', 'failed')), search_error text, search_started_at timestamptz, search_note text,
  updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE equity.exit_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON equity.exit_plans;
CREATE POLICY tenant_isolation ON equity.exit_plans USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON equity.exit_plans TO aidi_os_app;

-- Documents behind a holding (a SAFE, note, share purchase agreement, certificate, side letter), attached to the holder
-- and, when known, to the SAFE / note or the share issuance. The file sits in Documents (Financing) and, if chosen, in
-- the data room's Financing room, in a folder per funding round.
CREATE TABLE IF NOT EXISTS equity.holder_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  holder_id uuid NOT NULL REFERENCES equity.holders(id) ON DELETE CASCADE,
  convertible_id uuid REFERENCES equity.convertibles(id) ON DELETE SET NULL,
  issuance_id uuid REFERENCES equity.issuances(id) ON DELETE SET NULL,
  document_id uuid NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('safe', 'note', 'spa', 'certificate', 'side_letter', 'other')),
  round text CHECK (length(round) <= 60),
  room_file_id uuid REFERENCES fundraise.files(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holder_id, document_id));
CREATE INDEX IF NOT EXISTS holder_docs_ct_idx ON equity.holder_docs (captable_id);
ALTER TABLE equity.holder_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON equity.holder_docs;
CREATE POLICY tenant_isolation ON equity.holder_docs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON equity.holder_docs TO aidi_os_app;
