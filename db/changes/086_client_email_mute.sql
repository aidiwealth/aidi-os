-- Per-client switch: stop job emails (messages, status changes, shared files) to a services client while the team works.
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS emails_muted boolean NOT NULL DEFAULT false;
