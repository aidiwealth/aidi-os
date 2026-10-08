-- 073_user_mfa.sql — authenticator-app two-step verification (per user, optional).
BEGIN;
CREATE TABLE IF NOT EXISTS core.user_mfa (
  user_id uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE, secret_enc text NOT NULL, enabled_at timestamptz,
  recovery_hashes text[] NOT NULL DEFAULT '{}', last_step bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT, UPDATE, DELETE ON core.user_mfa TO aidi_os_app;
COMMIT;
