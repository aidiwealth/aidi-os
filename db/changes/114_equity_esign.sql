-- Equity documents signed in Finvry: SAFEs, option grants, share purchases and the board consents that approve them.
-- Each document keeps the exact text signed and every signer (company, holder, directors); when everyone has signed,
-- the cap table records the SAFE, grant or shares itself. Share issuances get electronic certificates.
BEGIN;
CREATE TABLE IF NOT EXISTS equity.esign_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  captable_id uuid NOT NULL REFERENCES equity.captables(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('safe', 'grant', 'purchase', 'consent')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (length(body) <= 120000),
  extra jsonb NOT NULL DEFAULT '[]'::jsonb,
  record jsonb,
  applied_id uuid,
  consent_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL,
  consent_outside boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'signed', 'void')),
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, voided_at timestamptz);
CREATE INDEX IF NOT EXISTS esign_docs_ct ON equity.esign_docs (captable_id, created_at DESC);
CREATE TABLE IF NOT EXISTS equity.esign_signers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  doc_id uuid NOT NULL REFERENCES equity.esign_docs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('company', 'holder', 'director')),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email text NOT NULL CHECK (length(email) <= 254),
  title text CHECK (length(title) <= 120),
  token_hash text NOT NULL UNIQUE,
  sort int NOT NULL DEFAULT 0,
  sent_at timestamptz, viewed_at timestamptz, signed_at timestamptz,
  signature_kind text CHECK (signature_kind IN ('typed', 'drawn', 'uploaded')),
  signature_png text CHECK (length(signature_png) <= 800000),
  ip text, user_agent text CHECK (length(user_agent) <= 400));
CREATE INDEX IF NOT EXISTS esign_signers_doc ON equity.esign_signers (doc_id);
ALTER TABLE equity.issuances ADD COLUMN IF NOT EXISTS certificate_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL;
ALTER TABLE equity.issuances ADD COLUMN IF NOT EXISTS esign_doc_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL;
ALTER TABLE equity.issuances ADD COLUMN IF NOT EXISTS consent_doc_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL;
ALTER TABLE equity.grants ADD COLUMN IF NOT EXISTS esign_doc_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL;
ALTER TABLE equity.grants ADD COLUMN IF NOT EXISTS consent_doc_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL;
ALTER TABLE equity.convertibles ADD COLUMN IF NOT EXISTS esign_doc_id uuid REFERENCES equity.esign_docs(id) ON DELETE SET NULL;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['equity.esign_docs', 'equity.esign_signers'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP; END $$;
COMMIT;
