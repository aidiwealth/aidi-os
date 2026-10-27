-- 171_wm_identity.sql — Aidi Wealth identity checks, step by step.
--  wm.kyc_items   each document a client (or the team) adds for the check: a government ID or a proof of address,
--                 what the AI read from it, and the team's decision (with the reason the client is shown)
--  wm.kyc_events  what happened, in order, for the client and the team to see
BEGIN;
CREATE TABLE IF NOT EXISTS wm.kyc_items (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE,
  kind            text        NOT NULL CHECK (kind IN ('id_document', 'proof_of_address', 'other')),
  doc_type        text        CHECK (doc_type IS NULL OR length(doc_type) <= 40),
  document_id     uuid        NOT NULL REFERENCES core.documents(id) ON DELETE RESTRICT,
  status          text        NOT NULL DEFAULT 'to_review' CHECK (status IN ('to_review', 'accepted', 'rejected')),
  ai              jsonb,
  note            text        CHECK (note IS NULL OR length(note) <= 500),
  added_by        text        NOT NULL DEFAULT 'client' CHECK (added_by IN ('client', 'staff')),
  reviewed_by     uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS wm_kyc_items_client ON wm.kyc_items (client_id, created_at DESC);
CREATE TABLE IF NOT EXISTS wm.kyc_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id       uuid        NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE,
  text            text        NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  actor           text        NOT NULL CHECK (actor IN ('client', 'staff', 'automatic')),
  created_at      timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS wm_kyc_events_client ON wm.kyc_events (client_id, created_at DESC);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['kyc_items', 'kyc_events'] LOOP
    EXECUTE format('ALTER TABLE wm.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON wm.%I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON wm.%I USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP; END $$;
GRANT SELECT, INSERT, UPDATE ON wm.kyc_items, wm.kyc_events TO aidi_os_app;
-- The single ID document uploaded before this lives on as the first item.
INSERT INTO wm.kyc_items (organization_id, client_id, kind, doc_type, document_id, status, added_by, created_at)
  SELECT c.organization_id, c.id, 'id_document', 'government_id', c.kyc_doc_id, CASE WHEN c.kyc_status = 'verified' THEN 'accepted' ELSE 'to_review' END, 'staff', c.updated_at
  FROM wm.clients c WHERE c.kyc_doc_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM wm.kyc_items k WHERE k.document_id = c.kyc_doc_id);
COMMIT;
