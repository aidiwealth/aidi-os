-- When a recurring service (virtual office, registered agent) actually started — for logging an old order today.
ALTER TABLE wallet.subscriptions ADD COLUMN IF NOT EXISTS started_on date;
