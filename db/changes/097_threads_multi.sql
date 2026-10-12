-- 097_threads_multi.sql — a client can have several open conversations at once (one per topic), and each conversation
-- carries a type (general, state notice, bank notice, mail received…), set by the team.
BEGIN;
DROP INDEX IF EXISTS services.threads_one_open;
ALTER TABLE services.threads ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE services.threads ADD COLUMN IF NOT EXISTS started_by text NOT NULL DEFAULT 'client';
ALTER TABLE services.threads DROP CONSTRAINT IF EXISTS threads_category_check;
ALTER TABLE services.threads ADD CONSTRAINT threads_category_check CHECK (category IN ('general', 'state_notice', 'tax_notice', 'bank_notice', 'mail', 'compliance', 'legal', 'billing'));
ALTER TABLE services.threads DROP CONSTRAINT IF EXISTS threads_started_by_check;
ALTER TABLE services.threads ADD CONSTRAINT threads_started_by_check CHECK (started_by IN ('team', 'client'));
CREATE INDEX IF NOT EXISTS threads_status ON services.threads (status, last_message_at DESC);
-- Existing conversations take the type of their first labelled team message.
UPDATE services.threads t SET category = m.category FROM (SELECT DISTINCT ON (thread_id) thread_id, category FROM services.messages WHERE from_team AND category <> 'general' ORDER BY thread_id, created_at) m WHERE m.thread_id = t.id AND t.category = 'general';
COMMIT;
