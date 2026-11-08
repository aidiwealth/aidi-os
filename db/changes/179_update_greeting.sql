-- 179_update_greeting.sql — the greeting line of an investor update ("Hi {first name},", "Dear {first name},", or
-- none). NULL keeps the usual "Hi {first name},"; an empty string means no greeting.
ALTER TABLE financials.updates ADD COLUMN IF NOT EXISTS greeting text;
