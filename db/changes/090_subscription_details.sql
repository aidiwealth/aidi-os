-- Details of a recurring service, e.g. the virtual office's state and street address (editable by the services team).
ALTER TABLE wallet.subscriptions ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
