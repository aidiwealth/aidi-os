-- Aidi Wealth: asset types a client does not want (hidden from them and from the AI's suggestions), and onboarding that
-- finishes with the investing account left for later.
ALTER TABLE wm.clients ADD COLUMN IF NOT EXISTS assets_off text[] NOT NULL DEFAULT '{}';
ALTER TABLE wm.onboarding DROP CONSTRAINT IF EXISTS onboarding_account_status_check;
ALTER TABLE wm.onboarding ADD CONSTRAINT onboarding_account_status_check CHECK (account_status IS NULL OR account_status IN ('not_needed', 'waiting', 'opened', 'failed', 'held', 'later'));
