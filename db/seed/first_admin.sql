-- Give the first person admin access. Run once, as the database admin, after 001_core.sql:
--   psql "$ADMIN_DATABASE_URL" -v email="'you@example.com'" -v name="'Your Name'" -f db/seed/first_admin.sql
BEGIN;
INSERT INTO core.people (full_name, email, kind) VALUES (:name, lower(:email), 'team')
  ON CONFLICT (email) WHERE email IS NOT NULL DO NOTHING;
INSERT INTO core.users (person_id, email)
  SELECT id, email FROM core.people WHERE email = lower(:email)
  ON CONFLICT (email) DO NOTHING;
INSERT INTO core.user_roles (user_id, role_code)
  SELECT id, 'admin' FROM core.users WHERE email = lower(:email)
  ON CONFLICT DO NOTHING;
COMMIT;
