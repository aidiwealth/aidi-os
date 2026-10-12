-- 096_message_category.sql — the team can label a message to a client: state notice, IRS / tax notice, bank notice,
-- mail received, compliance reminder, legal notice or billing (default: general).
BEGIN;
ALTER TABLE services.messages ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE services.messages DROP CONSTRAINT IF EXISTS messages_category_check;
ALTER TABLE services.messages ADD CONSTRAINT messages_category_check CHECK (category IN ('general', 'state_notice', 'tax_notice', 'bank_notice', 'mail', 'compliance', 'legal', 'billing'));
COMMIT;
