-- 050_rolling_fund.sql — closed-end or rolling (deal-by-deal) funds; Aidi Angel Fund is rolling.
BEGIN;
ALTER TABLE funds.funds ADD COLUMN IF NOT EXISTS structure text NOT NULL DEFAULT 'closed_end' CHECK (structure IN ('closed_end','rolling'));
UPDATE funds.funds f SET structure = 'rolling', target_size = NULL, term_years = NULL, mgmt_fee_pct = NULL, carry_pct = NULL, hurdle_pct = NULL
  FROM core.entities e WHERE e.id = f.entity_id AND regexp_replace(lower(e.name), '[^a-z0-9]', '', 'g') = 'aidiangelfund';
COMMIT;
