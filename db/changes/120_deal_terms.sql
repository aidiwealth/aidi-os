-- Fundraising pipelines: each investor can have their own valuation cap (post- or pre-money) and discount, which
-- override the pipeline's terms and carry onto the cap table when the investor is added to it.
ALTER TABLE crm.deals ADD COLUMN IF NOT EXISTS valuation_cap numeric(20,2) CHECK (valuation_cap > 0),
  ADD COLUMN IF NOT EXISTS cap_basis text CHECK (cap_basis IN ('post', 'pre')),
  ADD COLUMN IF NOT EXISTS discount numeric(5,2) CHECK (discount >= 0 AND discount < 100);
