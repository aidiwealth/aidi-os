-- 078_portfolio_schedule.sql — automatic update requests per portfolio company: off, monthly or quarterly, on a chosen day.
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS report_cadence text NOT NULL DEFAULT 'off';
ALTER TABLE portfolio.companies ADD COLUMN IF NOT EXISTS report_day integer NOT NULL DEFAULT 5;
DO $$ BEGIN
  ALTER TABLE portfolio.companies ADD CONSTRAINT companies_report_cadence_chk CHECK (report_cadence IN ('off','monthly','quarterly'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE portfolio.companies ADD CONSTRAINT companies_report_day_chk CHECK (report_day BETWEEN 1 AND 28);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
