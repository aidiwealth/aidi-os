-- 101_rentals.sql — Rental & Real Estate (by Aidi Haven): properties and their rooms/units, Airbnb listings
-- (calendar, rating), bookings and payouts imported from Airbnb's monthly CSV and Earnings report, bank matching,
-- expenses with categories, leases and rent for non-Airbnb rentals, an activity feed and month locks.
-- Seeds Aidi Haven's two San Jose properties (the 1-bedroom ADU and the 3-bedroom house let by the room).
BEGIN;
CREATE SCHEMA IF NOT EXISTS rentals;
GRANT USAGE ON SCHEMA rentals TO aidi_os_app;

CREATE TABLE IF NOT EXISTS rentals.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES core.entities(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  address text CHECK (length(address) <= 500),
  kind text NOT NULL DEFAULT 'house' CHECK (kind IN ('house', 'adu', 'apartment', 'condo', 'other')),
  ownership text NOT NULL DEFAULT 'owned' CHECK (ownership IN ('owned', 'leased')),
  bedrooms int CHECK (bedrooms BETWEEN 0 AND 50),
  acquired_on date,
  image_url text CHECK (length(image_url) <= 1000),
  notes text CHECK (length(notes) <= 4000),
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now());

-- A room or a whole unit. Airbnb units carry the listing (id, link, iCal) and the names Airbnb uses for them.
CREATE TABLE IF NOT EXISTS rentals.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES rentals.properties(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  rental_model text NOT NULL DEFAULT 'entire' CHECK (rental_model IN ('room', 'entire')),
  source text NOT NULL DEFAULT 'airbnb' CHECK (source IN ('airbnb', 'direct', 'other')),
  aliases text[] NOT NULL DEFAULT '{}',
  airbnb_listing_id text CHECK (airbnb_listing_id ~ '^[0-9]{5,25}$'),
  ical_url text CHECK (length(ical_url) <= 1000),
  title text, image_url text, price numeric(12,2), rating numeric(3,2), review_count int,
  refreshed_at timestamptz, ical_synced_at timestamptz, refresh_error text,
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, airbnb_listing_id));

-- iCal: reserved and blocked nights, replaced on each sync.
CREATE TABLE IF NOT EXISTS rentals.calendar (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES rentals.units(id) ON DELETE CASCADE,
  uid text NOT NULL, starts date NOT NULL, ends date NOT NULL, kind text NOT NULL CHECK (kind IN ('reserved', 'blocked')),
  confirmation_code text, summary text,
  PRIMARY KEY (unit_id, uid));

CREATE TABLE IF NOT EXISTS rentals.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  period text CHECK (period ~ '^20[0-9]{2}-[01][0-9]$'),
  csv_document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  pdf_document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  parsed jsonb NOT NULL DEFAULT '{}'::jsonb,
  control jsonb,
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview', 'saved', 'discarded')),
  rows_new int NOT NULL DEFAULT 0, rows_dup int NOT NULL DEFAULT 0,
  imported_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), saved_at timestamptz);

-- One row of Airbnb's transaction history. Payout rows carry the reference code; the rows they settle point to it.
CREATE TABLE IF NOT EXISTS rentals.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  import_id uuid REFERENCES rentals.imports(id) ON DELETE SET NULL,
  unit_id uuid REFERENCES rentals.units(id) ON DELETE SET NULL,
  type text NOT NULL, txn_date date NOT NULL, expected_arrival date,
  confirmation_code text, booked_on date, check_in date, check_out date, nights int,
  guest text, listing text, details text, payout_ref text, settled_by text,
  currency text NOT NULL DEFAULT 'USD',
  amount numeric(12,2), paid_out numeric(12,2), service_fee numeric(12,2), fast_pay_fee numeric(12,2), cleaning_fee numeric(12,2),
  gross numeric(12,2), remitted_tax numeric(12,2), earnings_year int,
  dedupe text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dedupe));
CREATE INDEX IF NOT EXISTS rentals_txn_date ON rentals.transactions (organization_id, txn_date);
CREATE INDEX IF NOT EXISTS rentals_txn_code ON rentals.transactions (confirmation_code);

-- An Airbnb payout matched to a bank deposit (banking.transactions), automatically or by hand.
CREATE TABLE IF NOT EXISTS rentals.payout_matches (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  payout_ref text NOT NULL,
  bank_txn_id uuid REFERENCES banking.transactions(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('auto', 'manual', 'note')),
  note text CHECK (length(note) <= 500),
  matched_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  matched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, payout_ref));
CREATE UNIQUE INDEX IF NOT EXISTS rentals_match_bank ON rentals.payout_matches (bank_txn_id) WHERE bank_txn_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rentals.expense_categories (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  hint text CHECK (length(hint) <= 200),
  sort int NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, code));

CREATE TABLE IF NOT EXISTS rentals.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES rentals.properties(id) ON DELETE RESTRICT,
  unit_id uuid REFERENCES rentals.units(id) ON DELETE SET NULL,
  category text NOT NULL,
  item text CHECK (length(item) <= 300),
  quantity numeric(10,2),
  vendor text CHECK (length(vendor) <= 200),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  spent_on date NOT NULL,
  receipt_document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  recurring boolean NOT NULL DEFAULT false,
  recurred_from uuid REFERENCES rentals.expenses(id) ON DELETE SET NULL,
  notes text CHECK (length(notes) <= 2000),
  bank_txn_id uuid REFERENCES banking.transactions(id) ON DELETE SET NULL,
  created_by uuid REFERENCES core.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS rentals_expenses_bank ON rentals.expenses (bank_txn_id) WHERE bank_txn_id IS NOT NULL;
-- Bank payments the team marked as not a rental cost (so they stop showing under "From the bank").
CREATE TABLE IF NOT EXISTS rentals.bank_ignored (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  bank_txn_id uuid NOT NULL REFERENCES banking.transactions(id) ON DELETE CASCADE,
  ignored_by uuid REFERENCES core.users(id) ON DELETE SET NULL, ignored_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, bank_txn_id));
CREATE INDEX IF NOT EXISTS rentals_expenses_date ON rentals.expenses (organization_id, spent_on DESC);

-- Non-Airbnb rentals: a lease per unit and its monthly rent.
CREATE TABLE IF NOT EXISTS rentals.leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES rentals.units(id) ON DELETE CASCADE,
  tenant_name text NOT NULL CHECK (length(tenant_name) BETWEEN 1 AND 200),
  tenant_email text CHECK (length(tenant_email) <= 254), tenant_phone text CHECK (length(tenant_phone) <= 40),
  rent numeric(12,2) NOT NULL CHECK (rent >= 0), due_day int NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 28),
  deposit numeric(12,2), starts_on date NOT NULL, ends_on date,
  document_id uuid REFERENCES core.documents(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes text CHECK (length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS rentals.rent_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  lease_id uuid NOT NULL REFERENCES rentals.leases(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^20[0-9]{2}-[01][0-9]$'),
  due_on date NOT NULL, amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2), paid_on date, method text, bank_txn_id uuid REFERENCES banking.transactions(id) ON DELETE SET NULL, note text,
  UNIQUE (lease_id, period));

CREATE TABLE IF NOT EXISTS rentals.activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES rentals.properties(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES rentals.units(id) ON DELETE CASCADE,
  event text NOT NULL, detail text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS rentals_activity_at ON rentals.activity (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rentals.locks (
  organization_id uuid NOT NULL DEFAULT core.current_org() REFERENCES core.organizations(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period ~ '^20[0-9]{2}-[01][0-9]$'),
  locked_by uuid REFERENCES core.users(id) ON DELETE SET NULL, locked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period));

DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rentals.properties', 'rentals.units', 'rentals.calendar', 'rentals.imports', 'rentals.transactions', 'rentals.payout_matches', 'rentals.expense_categories', 'rentals.expenses', 'rentals.leases', 'rentals.rent_charges', 'rentals.activity', 'rentals.locks', 'rentals.bank_ignored'] LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %s USING (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass()) WITH CHECK (organization_id IS NOT DISTINCT FROM core.current_org() OR core.is_bypass())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO aidi_os_app', t);
  END LOOP;
END $rls$;

UPDATE core.plans SET modules = array_append(modules, 'rentals') WHERE code = 'internal' AND NOT ('rentals' = ANY(modules));

-- Seed: the workspace that holds Aidi Haven LLC gets its expense categories and its two properties.
DO $seed$
DECLARE org uuid; ent uuid; adu uuid; house uuid;
BEGIN
  SELECT organization_id, id INTO org, ent FROM core.entities WHERE name ILIKE 'Aidi Haven%' ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN RETURN; END IF;
  INSERT INTO rentals.expense_categories (organization_id, code, label, hint, sort) VALUES
    (org, 'utilities', 'Utilities', 'Electricity, gas, water, internet', 1),
    (org, 'cleaning', 'Cleaning & laundry', 'Cleaner, linens', 2),
    (org, 'supplies', 'Supplies', 'Toiletries, kitchen items', 3),
    (org, 'furniture', 'Furniture & appliances', 'Beds, TVs', 4),
    (org, 'repairs', 'Repairs & maintenance', 'Plumber, handyman', 5),
    (org, 'rent_fees', 'Rent, insurance & fees', 'Lease or mortgage, insurance, permits, property tax', 6)
  ON CONFLICT DO NOTHING;
  IF EXISTS (SELECT 1 FROM rentals.properties WHERE organization_id = org) THEN RETURN; END IF;
  INSERT INTO rentals.properties (organization_id, entity_id, name, address, kind, bedrooms, sort) VALUES (org, ent, '1 Bedroom ADU', '458 N 7th Street (ADU), San Jose, CA', 'adu', 1, 1) RETURNING id INTO adu;
  INSERT INTO rentals.properties (organization_id, entity_id, name, address, kind, bedrooms, sort) VALUES (org, ent, '3 Bedroom House', '458 N 7th Street, San Jose, CA', 'house', 3, 2) RETURNING id INTO house;
  INSERT INTO rentals.units (organization_id, property_id, name, rental_model, aliases, airbnb_listing_id, title, sort, rating, review_count) VALUES
    (org, adu, '7th Street Oasis', 'entire', ARRAY['7th Street Oasis', 'Modern Stylish Home'], '1418768143163222496', 'Modern Stylish Home', 1, 4.89, 19),
    (org, house, 'Room 1 · Cozy Stay', 'room', ARRAY['7th Str. Private Room', 'Private Room 1 – Cozy Stay'], '1420822398386139572', 'Private Room 1 – Cozy Stay', 1, 4.91, 11),
    (org, house, 'Room 2 · Modern Stay', 'room', ARRAY['7th Street Room 2', 'Private Room 2 – Modern Stay'], '1424119770106341445', 'Private Room 2 – Modern Stay', 2, 4.77, 13),
    (org, house, 'Room 3 · Elegant Stay', 'room', ARRAY['7th Street Room 3', 'Private Room – Elegant Stay @ SJ'], '1435197325380944725', 'Private Room – Elegant Stay @ SJ', 3, 4.86, 7);
END $seed$;
COMMIT;
