-- Investor update tracking: delivery (from the email service), first open, link clicks per reader, and the links in
-- each update (clicks go through a redirect that only knows these, so it can't be used to send people elsewhere).
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS first_opened_at timestamptz;
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS clicks int NOT NULL DEFAULT 0;
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS last_clicked_at timestamptz;
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS email_id text;
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS delivery text CHECK (delivery IS NULL OR delivery IN ('sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed'));
ALTER TABLE financials.update_sends ADD COLUMN IF NOT EXISTS delivery_at timestamptz;
CREATE INDEX IF NOT EXISTS update_sends_email_id ON financials.update_sends (email_id) WHERE email_id IS NOT NULL;
UPDATE financials.update_sends SET first_opened_at = opened_at WHERE first_opened_at IS NULL AND opens > 0;
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS link_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE IF NOT EXISTS financials.update_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  update_id uuid NOT NULL REFERENCES financials.updates(id) ON DELETE CASCADE, send_id uuid NOT NULL REFERENCES financials.update_sends(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (length(url) <= 600), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS update_clicks_update ON financials.update_clicks (update_id, created_at);
ALTER TABLE financials.update_clicks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON financials.update_clicks;
CREATE POLICY tenant_isolation ON financials.update_clicks USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON financials.update_clicks TO aidi_os_app;
