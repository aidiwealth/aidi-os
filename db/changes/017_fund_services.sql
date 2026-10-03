-- 017_fund_services.sql — the fund professionals directory and logged introductions (platform level).
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/017_fund_services.sql
BEGIN;
CREATE TABLE IF NOT EXISTS platform.professionals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  firm          text        CHECK (length(firm) <= 200),
  title         text        CHECK (length(title) <= 200),
  services      text[]      NOT NULL DEFAULT '{}',
  jurisdictions text[]      NOT NULL DEFAULT '{}',
  bio           text        CHECK (length(bio) <= 2000),
  email         text        NOT NULL CHECK (position('@' IN email) > 1),
  phone         text        CHECK (length(phone) <= 40),
  website       text        CHECK (website IS NULL OR website ~ '^https://'),
  photo_url     text        CHECK (photo_url IS NULL OR photo_url ~ '^https://'),
  featured      boolean     NOT NULL DEFAULT false,
  active        boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.introductions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id  uuid        NOT NULL REFERENCES platform.professionals(id) ON DELETE CASCADE,
  organization_id  uuid        NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  user_id          uuid        REFERENCES core.users(id) ON DELETE SET NULL,
  message          text        CHECK (length(message) <= 2000),
  created_at       timestamptz NOT NULL DEFAULT now()
);
DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['platform.professionals','platform.introductions'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS platform_only ON %s', t);
    EXECUTE format('CREATE POLICY platform_only ON %s USING (core.is_bypass()) WITH CHECK (core.is_bypass())', t);
  END LOOP;
END $p$;
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.professionals TO aidi_os_app;
GRANT SELECT, INSERT ON platform.introductions TO aidi_os_app;
COMMIT;
