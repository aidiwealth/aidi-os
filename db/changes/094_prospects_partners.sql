-- 094_prospects_partners.sql — (1) a curated list of investors and grants founders can search by location, stage,
-- sector and amount, and add to a fundraising pipeline; (2) partner discounts: VCs, incubators, accelerators and
-- communities get a code their startups redeem for a discount on Finvry plans; approved partners are listed publicly.
BEGIN;
CREATE TABLE IF NOT EXISTS crm.prospects (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text        NOT NULL CHECK (kind IN ('investor', 'grant')),
  name         text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  type         text        NOT NULL DEFAULT 'vc' CHECK (type IN ('vc', 'angel_network', 'accelerator', 'corporate', 'government', 'foundation', 'competition', 'credits', 'other')),
  regions      text[]      NOT NULL DEFAULT '{Global}',
  stages       text[]      NOT NULL DEFAULT '{}',
  sectors      text[]      NOT NULL DEFAULT '{}',
  min_usd      numeric(14,2),
  max_usd      numeric(14,2),
  website      text        CHECK (length(website) <= 300),
  description  text        CHECK (length(description) <= 2000),
  how_to_apply text        CHECK (length(how_to_apply) <= 1000),
  deadline     text        CHECK (length(deadline) <= 120),
  active       boolean     NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospects_name_kind ON crm.prospects (lower(name), kind);
GRANT SELECT ON crm.prospects TO aidi_os_app;
GRANT INSERT, UPDATE, DELETE ON crm.prospects TO aidi_os_app;

INSERT INTO crm.prospects (kind, name, type, regions, stages, sectors, min_usd, max_usd, website, description, how_to_apply) VALUES
 ('investor', 'Y Combinator', 'accelerator', '{Global}', '{pre_seed,seed}', '{}', 500000, 500000, 'https://www.ycombinator.com', 'Three-month accelerator with a standard deal of $500,000 for early-stage startups from any country and sector.', 'Apply online for the next batch.'),
 ('investor', 'Techstars', 'accelerator', '{Global}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://www.techstars.com', 'Global accelerator network with programs by city and theme; invests in each company it accepts.', 'Apply to a specific program on the Techstars site.'),
 ('investor', '500 Global', 'vc', '{Global}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://500.co', 'Early-stage investor and accelerator backing founders across many markets.', 'Apply through the 500 Global website.'),
 ('investor', 'Antler', 'accelerator', '{Global,Africa,Nigeria}', '{pre_seed}', '{}', NULL, NULL, 'https://www.antler.co', 'Day-zero investor with residency programs worldwide, including in Africa.', 'Apply to a residency or for investment online.'),
 ('investor', 'Ventures Platform', 'vc', '{Nigeria,Africa}', '{pre_seed,seed}', '{fintech,health,education,saas,climate}', NULL, NULL, 'https://venturesplatform.com', 'Pan-African early-stage fund headquartered in Nigeria.', 'Pitch through the fund website.'),
 ('investor', 'Future Africa', 'vc', '{Nigeria,Africa}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://www.future.africa', 'Early-stage investor backing African founders, with a community of co-investors.', 'Submit your startup on the Future Africa site.'),
 ('investor', 'LoftyInc Capital', 'vc', '{Nigeria,Africa}', '{pre_seed,seed}', '{fintech,saas}', NULL, NULL, 'https://www.loftyincltd.biz', 'Early-stage fund investing in African technology startups.', 'Reach out through the fund website.'),
 ('investor', 'TLcom Capital', 'vc', '{Africa,Nigeria}', '{seed,series_a}', '{fintech,saas,health,logistics}', NULL, NULL, 'https://tlcomcapital.com', 'Venture firm backing technology companies across Africa from seed to Series A.', 'Pitch through the TLcom website.'),
 ('investor', 'Partech Africa', 'vc', '{Africa,Nigeria}', '{series_a,series_b}', '{}', NULL, NULL, 'https://partechpartners.com', 'Growth-oriented venture fund focused on African technology companies.', 'Contact the Africa team through the Partech site.'),
 ('investor', '4DX Ventures', 'vc', '{Africa,Nigeria}', '{seed,series_a}', '{fintech,health,commerce}', NULL, NULL, 'https://4dxventures.com', 'Early-stage firm investing in African startups.', 'Pitch through the website.'),
 ('investor', 'Launch Africa Ventures', 'vc', '{Africa,Nigeria}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://launchafrica.vc', 'Seed-stage fund writing early cheques across Africa.', 'Submit through the website.'),
 ('investor', 'Microtraction', 'vc', '{Nigeria,Africa}', '{pre_seed}', '{}', NULL, NULL, 'https://microtraction.com', 'Pre-seed investor backing African technology founders early.', 'Apply online.'),
 ('investor', 'Ingressive Capital', 'vc', '{Africa,Nigeria}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://ingressivecapital.com', 'Early-stage fund investing in African technology startups.', 'Pitch through the website.'),
 ('investor', 'Norrsken22', 'vc', '{Africa}', '{series_a,series_b}', '{fintech,health,education}', NULL, NULL, 'https://www.norrsken22.com', 'Growth fund investing in African technology companies.', 'Contact through the website.'),
 ('investor', 'Flat6Labs', 'accelerator', '{Africa}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://flat6labs.com', 'Seed and early-stage investor and accelerator in Africa and the Middle East.', 'Apply to an open program.'),
 ('investor', 'Founders Factory Africa', 'accelerator', '{Africa,Nigeria}', '{pre_seed,seed}', '{fintech,health,climate}', NULL, NULL, 'https://www.foundersfactory.africa', 'Venture builder and accelerator for African startups.', 'Apply to an open program.'),
 ('investor', 'Precursor Ventures', 'vc', '{United States}', '{pre_seed}', '{}', NULL, NULL, 'https://precursorvc.com', 'Pre-seed fund backing US founders at the earliest stage.', 'Pitch through the website.'),
 ('investor', 'Hustle Fund', 'vc', '{United States,Global}', '{pre_seed}', '{saas,fintech,commerce}', NULL, NULL, 'https://www.hustlefund.vc', 'Pre-seed fund writing early cheques into software founders.', 'Pitch through the website.'),
 ('investor', 'First Round Capital', 'vc', '{United States}', '{seed}', '{}', NULL, NULL, 'https://firstround.com', 'Seed-stage venture firm known for its founder community.', 'Reach out through the website or a warm introduction.'),
 ('investor', 'Pear VC', 'vc', '{United States}', '{pre_seed,seed}', '{}', NULL, NULL, 'https://pear.vc', 'Pre-seed and seed fund with an accelerator program.', 'Apply online.'),
 ('grant', 'Tony Elumelu Foundation Entrepreneurship Programme', 'foundation', '{Africa,Nigeria}', '{idea,pre_seed}', '{}', 5000, 5000, 'https://www.tonyelumelufoundation.org', 'Training, mentoring and $5,000 non-refundable seed capital for African entrepreneurs.', 'Apply on TEFConnect when the yearly window opens.'),
 ('grant', 'Africa Prize for Engineering Innovation', 'competition', '{Africa,Nigeria}', '{idea,pre_seed,seed}', '{hardware,climate,health,agriculture}', NULL, NULL, 'https://raeng.org.uk/africa-prize', 'Royal Academy of Engineering prize and training for sub-Saharan engineering innovators; the winner receives £50,000.', 'Apply when the yearly call opens.'),
 ('grant', 'SBIR / STTR (America''s Seed Fund)', 'government', '{United States}', '{idea,pre_seed,seed}', '{deep_tech,health,climate,hardware,saas}', NULL, NULL, 'https://www.sbir.gov', 'Non-dilutive US federal funding for small businesses doing research and development, through agencies such as NSF, NIH and DoD.', 'Find open topics on sbir.gov and apply through the agency.'),
 ('grant', 'Google for Startups Accelerator: Africa', 'accelerator', '{Africa,Nigeria}', '{seed,series_a}', '{}', NULL, NULL, 'https://startup.google.com', 'Equity-free accelerator with mentoring, Google technical support and cloud credits.', 'Apply when the cohort opens.'),
 ('grant', 'AWS Activate', 'credits', '{Global}', '{idea,pre_seed,seed,series_a}', '{}', NULL, NULL, 'https://aws.amazon.com/startups', 'Cloud credits, training and support for startups building on AWS.', 'Apply on the AWS Startups site.')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS platform.partners (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  kind            text        NOT NULL DEFAULT 'vc' CHECK (kind IN ('vc', 'incubator', 'accelerator', 'startup', 'community', 'university', 'other')),
  website         text        CHECK (length(website) <= 300),
  logo_url        text        CHECK (length(logo_url) <= 500),
  contact_name    text        CHECK (length(contact_name) <= 200),
  contact_email   text        CHECK (length(contact_email) <= 254),
  note            text        CHECK (length(note) <= 2000),
  code            text        UNIQUE CHECK (code ~ '^[A-Z0-9-]{4,30}$'),
  discount_pct    int         NOT NULL DEFAULT 20 CHECK (discount_pct BETWEEN 1 AND 100),
  months          int         CHECK (months BETWEEN 1 AND 60),
  max_redemptions int         CHECK (max_redemptions > 0),
  expires_on      date,
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paused', 'rejected')),
  listed          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.partner_redemptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      uuid        NOT NULL REFERENCES platform.partners(id) ON DELETE CASCADE,
  organization_id uuid        NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  discount_pct    int         NOT NULL,
  until           date,
  redeemed_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, organization_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON platform.partners, platform.partner_redemptions TO aidi_os_app;
COMMIT;
