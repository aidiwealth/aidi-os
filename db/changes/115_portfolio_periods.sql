-- Portfolio figures keep the period they were reported for. A quarterly report is one row on the quarter's last month
-- with months = 3 (revenue is the quarter's total; net burn is the average per month; cash, customers, headcount and
-- margin are at the end of the quarter), instead of being spread over three monthly rows.
ALTER TABLE portfolio.metric_values ADD COLUMN IF NOT EXISTS months smallint NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE portfolio.metric_values ADD CONSTRAINT metric_values_months_chk CHECK (months BETWEEN 1 AND 12);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A founder link asks for one month (1) or one quarter (3).
ALTER TABLE portfolio.requests ADD COLUMN IF NOT EXISTS months smallint NOT NULL DEFAULT 1;
DO $$ BEGIN
  ALTER TABLE portfolio.requests ADD CONSTRAINT requests_months_chk CHECK (months IN (1, 3));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE portfolio.requests r SET months = 3 FROM portfolio.companies c
 WHERE c.id = r.company_id AND c.report_cadence = 'quarterly' AND extract(month FROM r.period)::int % 3 = 0 AND r.months = 1;

-- Earlier imports spread a quarter evenly over its three months. Fold those back into one quarter row: a calendar
-- quarter whose three months carry the same reported revenue (to the cent, no team correction) was spread.
DO $$
DECLARE q record;
BEGIN
  FOR q IN
    SELECT m3.company_id, m3.period AS q_end
      FROM portfolio.metric_values m3
      JOIN portfolio.metric_values m2 ON m2.company_id = m3.company_id AND m2.metric = 'revenue' AND m2.period = (m3.period - interval '1 month')::date
      JOIN portfolio.metric_values m1 ON m1.company_id = m3.company_id AND m1.metric = 'revenue' AND m1.period = (m3.period - interval '2 months')::date
     WHERE m3.metric = 'revenue' AND m3.months = 1 AND extract(month FROM m3.period)::int % 3 = 0
       AND m3.founder_value IS NOT NULL AND m3.founder_value = m2.founder_value AND m3.founder_value = m1.founder_value
       AND m1.override_value IS NULL AND m2.override_value IS NULL AND m3.override_value IS NULL
       AND m1.months = 1 AND m2.months = 1
  LOOP
    UPDATE portfolio.metric_values SET founder_value = round(founder_value * 3, 2), months = 3, updated_at = now()
     WHERE company_id = q.company_id AND period = q.q_end AND metric = 'revenue';
    DELETE FROM portfolio.metric_values WHERE company_id = q.company_id AND metric = 'revenue' AND override_value IS NULL
       AND period IN ((q.q_end - interval '1 month')::date, (q.q_end - interval '2 months')::date);
    -- Net burn spread the same way: keep the monthly average once, on the quarter's last month.
    IF (SELECT count(DISTINCT founder_value) = 1 AND count(*) = 3 AND bool_and(override_value IS NULL)
          FROM portfolio.metric_values WHERE company_id = q.company_id AND metric = 'net_burn'
           AND period BETWEEN (q.q_end - interval '2 months')::date AND q.q_end) THEN
      DELETE FROM portfolio.metric_values WHERE company_id = q.company_id AND metric = 'net_burn'
         AND period IN ((q.q_end - interval '1 month')::date, (q.q_end - interval '2 months')::date);
    END IF;
    -- Everything else reported on that quarter-end month belongs to the quarter.
    UPDATE portfolio.metric_values SET months = 3 WHERE company_id = q.company_id AND period = q.q_end;
  END LOOP;
END $$;

-- One row per calendar month for portfolio-wide charts and totals: a quarter's revenue counts a third in each of its
-- months and its burn rate in each month; balances (cash, customers, headcount, margin) stay on the period's last month.
CREATE OR REPLACE VIEW portfolio.metric_months WITH (security_invoker = true) AS
SELECT m.company_id, (m.period - make_interval(months => g.i))::date AS period, m.metric,
       CASE WHEN m.metric = 'revenue' THEN round(m.founder_value / m.months, 2) ELSE m.founder_value END AS founder_value,
       CASE WHEN m.metric = 'revenue' THEN round(m.override_value / m.months, 2) ELSE m.override_value END AS override_value
  FROM portfolio.metric_values m
 CROSS JOIN LATERAL generate_series(0, CASE WHEN m.metric IN ('revenue', 'net_burn') THEN m.months - 1 ELSE 0 END) AS g(i);
GRANT SELECT ON portfolio.metric_months TO aidi_os_app;
