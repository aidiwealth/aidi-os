-- 018_client_services.sql — client records (companies, people), service catalogue, client invoices and payments.
-- Apply once as the database admin:  psql "$ADMIN_DATABASE_URL" -f db/changes/018_client_services.sql
BEGIN;
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'company';
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE services.clients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS services.companies (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid        NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  client_id           uuid        NOT NULL REFERENCES services.clients(id) ON DELETE RESTRICT,
  name                text        NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  entity_type         text        NOT NULL DEFAULT 'llc' CHECK (entity_type IN ('llc','c_corp','s_corp','ltd','plc','other')),
  jurisdiction        text        CHECK (length(jurisdiction) <= 100),
  country             text        NOT NULL DEFAULT 'United States' CHECK (length(country) <= 100),
  registration_number text        CHECK (length(registration_number) <= 60),
  ein                 text        CHECK (ein IS NULL OR ein ~ '^[0-9]{2}-?[0-9]{7}$'),
  formation_date      date,
  fiscal_year_end     text        CHECK (length(fiscal_year_end) <= 10),
  address             text        CHECK (length(address) <= 500),
  registered_agent    text        NOT NULL DEFAULT 'ours' CHECK (registered_agent IN ('ours','theirs','none')),
  agent_renewal       date,
  virtual_office      boolean     NOT NULL DEFAULT false,
  mailbox             boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'active' CHECK (status IN ('forming','active','dissolved')),
  notes               text        CHECK (length(notes) <= 3000),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services.people (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  client_id        uuid          NOT NULL REFERENCES services.clients(id) ON DELETE RESTRICT,
  company_id       uuid          REFERENCES services.companies(id) ON DELETE SET NULL,
  name             text          NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  email            text          CHECK (email IS NULL OR position('@' IN email) > 1),
  phone            text          CHECK (length(phone) <= 40),
  role             text          NOT NULL DEFAULT 'contact' CHECK (role IN ('contact','owner','director','officer','other')),
  ownership_pct    numeric(6,3)  CHECK (ownership_pct IS NULL OR ownership_pct BETWEEN 0 AND 100),
  address          text          CHECK (length(address) <= 500),
  nationality      text          CHECK (length(nationality) <= 100),
  portal_access    boolean       NOT NULL DEFAULT false,
  created_at       timestamptz   NOT NULL DEFAULT now()
);
ALTER TABLE services.jobs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES services.companies(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS services.catalog (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  code             text          NOT NULL CHECK (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  name             text          NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description      text          CHECK (length(description) <= 500),
  billing          text          NOT NULL DEFAULT 'one_time' CHECK (billing IN ('one_time','annual','monthly','quoted')),
  price            numeric(12,2) CHECK (price IS NULL OR price >= 0),
  currency         text          NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','NGN')),
  formation        boolean       NOT NULL DEFAULT false,
  active           boolean       NOT NULL DEFAULT true,
  sort             integer       NOT NULL DEFAULT 10,
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS services.invoices (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id),
  number           text          NOT NULL,
  client_id        uuid          NOT NULL REFERENCES services.clients(id) ON DELETE RESTRICT,
  company_id       uuid          REFERENCES services.companies(id) ON DELETE SET NULL,
  job_id           uuid          REFERENCES services.jobs(id) ON DELETE SET NULL,
  region           text          NOT NULL CHECK (region IN ('us','ng')),
  currency         text          NOT NULL CHECK (currency IN ('USD','NGN')),
  issue_date       date          NOT NULL DEFAULT current_date,
  due_date         date          NOT NULL,
  lines            jsonb         NOT NULL,
  amount           numeric(14,2) NOT NULL CHECK (amount >= 0),
  bill_to          jsonb         NOT NULL,
  issuer           jsonb         NOT NULL,
  note             text          CHECK (length(note) <= 1000),
  status           text          NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  sent_at          timestamptz,
  paid_at          date,
  paid_via         text          CHECK (paid_via IN ('manual','stripe','paystack')),
  created_by       uuid          REFERENCES core.users(id) ON DELETE SET NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (organization_id, number)
);
CREATE TABLE IF NOT EXISTS services.invoice_payments (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid          NOT NULL REFERENCES core.organizations(id),
  invoice_id       uuid          NOT NULL REFERENCES services.invoices(id) ON DELETE CASCADE,
  provider         text          NOT NULL CHECK (provider IN ('stripe','paystack')),
  reference        text          NOT NULL UNIQUE,
  amount           numeric(14,2) NOT NULL,
  currency         text          NOT NULL,
  status           text          NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['services.companies','services.people','services.catalog','services.invoices','services.invoice_payments'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
  END LOOP;
END $rls$;
GRANT SELECT, INSERT, UPDATE, DELETE ON services.companies, services.people, services.catalog, services.invoices, services.invoice_payments TO aidi_os_app;
GRANT UPDATE ON services.clients TO aidi_os_app;

-- Aidi's own Client Services: invoice issuers and the price list from past invoices (bank details are entered in Settings)
UPDATE core.organizations SET settings = settings || jsonb_build_object('cs_billing', jsonb_build_object(
  'prefix', 'AIDI', 'terms_days', 30,
  'note_top', 'Thanks for choosing Aidi. If you have challenges in making payments, please reach out to team@aidiventures.com',
  'note_bottom', 'All invoices, services and products delivered by Aidi are properties of Aidi Ventures LLC.',
  'us', jsonb_build_object('issuer', 'Aidi Ventures LLC', 'address', E'2880 Zanker Road Suite 203\nSan Jose, California 95134\nUnited States', 'phone', '+1 408-422-1250', 'email', 'company@aidiventures.com'),
  'ng', jsonb_build_object('issuer', 'Aidi Technology Limited', 'address', '', 'phone', '', 'email', 'company@aidiventures.com')))
 WHERE slug = 'the-aidi-group' AND NOT settings ? 'cs_billing';
INSERT INTO services.catalog (organization_id, code, name, billing, price, currency, formation, sort)
SELECT o.id, v.code, v.name, v.billing, v.price, 'USD', v.formation, v.sort FROM core.organizations o
  CROSS JOIN (VALUES ('irs_annual','IRS Annual Filing','quoted',1500.00,false,1), ('de_franchise','Delaware State Tax Filing','annual',600.00,false,2),
    ('ca_state','California State Filing','annual',900.00,false,3), ('registered_agent','Registered Agent','annual',250.00,false,4),
    ('de_mailbox','Delaware Mailbox','monthly',30.00,false,5), ('virtual_office','Virtual Office','monthly',NULL,false,6),
    ('llc_formation','LLC Formation','one_time',NULL,true,7), ('inc_formation','C-Corp (Inc) Formation','one_time',NULL,true,8),
    ('ein','EIN Application','one_time',NULL,true,9), ('operating_agreement','Operating Agreement or Bylaws','one_time',NULL,true,10))
    AS v(code, name, billing, price, formation, sort)
 WHERE o.slug = 'the-aidi-group' ON CONFLICT (organization_id, code) DO NOTHING;
COMMIT;
