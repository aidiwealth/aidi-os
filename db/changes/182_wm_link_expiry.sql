-- Shared financial review and family view links expire after 90 days (existing ones get 90 days from now).
ALTER TABLE wm.report_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE wm.view_links ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE wm.report_links SET expires_at = now() + interval '90 days' WHERE expires_at IS NULL AND NOT revoked;
UPDATE wm.view_links SET expires_at = now() + interval '90 days' WHERE expires_at IS NULL AND NOT revoked;
ALTER TABLE wm.report_links ALTER COLUMN expires_at SET DEFAULT now() + interval '90 days';
ALTER TABLE wm.view_links ALTER COLUMN expires_at SET DEFAULT now() + interval '90 days';
