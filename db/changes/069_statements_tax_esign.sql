-- 069_statements_tax_esign.sql — wealth statements, tax documents, client documents with e-signature.
BEGIN;
CREATE TABLE IF NOT EXISTS wm.statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, period_kind text NOT NULL CHECK (period_kind IN ('monthly','quarterly','annual','custom')), period_start date NOT NULL, period_end date NOT NULL,
  data jsonb NOT NULL, doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL, published_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES core.users(id) ON DELETE SET NULL);
ALTER TABLE wm.statements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.statements;
CREATE POLICY tenant_isolation ON wm.statements USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.statements TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.statement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  statement_id uuid NOT NULL REFERENCES wm.statements(id) ON DELETE CASCADE, kind text NOT NULL CHECK (kind IN ('viewed','downloaded')), user_id uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.statement_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.statement_events;
CREATE POLICY tenant_isolation ON wm.statement_events USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.statement_events TO aidi_os_app;
CREATE TABLE IF NOT EXISTS core.tax_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  lp_id uuid REFERENCES funds.lps(id) ON DELETE CASCADE, wm_client_id uuid REFERENCES wm.clients(id) ON DELETE CASCADE, tax_year integer NOT NULL, form_type text NOT NULL, issuer text, note text,
  document_id uuid NOT NULL REFERENCES core.documents(id) ON DELETE CASCADE, uploaded_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz, first_viewed_at timestamptz, downloads integer NOT NULL DEFAULT 0, CHECK ((lp_id IS NULL) <> (wm_client_id IS NULL)));
ALTER TABLE core.tax_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON core.tax_docs;
CREATE POLICY tenant_isolation ON core.tax_docs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.tax_docs TO aidi_os_app;
CREATE TABLE IF NOT EXISTS wm.client_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES wm.clients(id) ON DELETE CASCADE, kind text NOT NULL, title text NOT NULL, body_md text NOT NULL, doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  requires_signature boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','declined','info')), holding_id uuid REFERENCES wealth.holdings(id) ON DELETE SET NULL,
  viewed_at timestamptz, signed_at timestamptz, signer_name text, signer_ip text, signer_ua text, decline_reason text, signed_doc_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE wm.client_docs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON wm.client_docs;
CREATE POLICY tenant_isolation ON wm.client_docs USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON wm.client_docs TO aidi_os_app;
UPDATE core.plans SET modules = array_append(modules, 'tax_docs') WHERE code = 'internal' AND NOT ('tax_docs' = ANY(modules));
COMMIT;
