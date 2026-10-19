-- 143_customer_currency_repair.sql — undo a wrong currency conversion of customer revenue (os213). Customer figures
-- already in a company's own currency (naira for a Nigerian subsidiary) but under settings that said US dollars were
-- multiplied by the exchange rate when the page was first opened. Such a company's customer revenue is then about an
-- exchange rate (hundreds to thousands of times) above its own revenue in Financials for the same months: those
-- figures are divided back, month by month, by the rate that was applied (the company's book rate for the month,
-- else its nearest book rate, else that month's recorded daily rate, else today's).
DO $fix$
DECLARE c record; cust numeric; stmt numeric; m record; rate numeric; n int := 0;
BEGIN
  FOR c IN SELECT cc.organization_id AS org, cc.entity_id AS ent, e.currency AS cur, e.name
             FROM financials.customer_config cc JOIN core.entities e ON e.id = cc.entity_id
            WHERE e.currency IS NOT NULL AND e.currency <> 'USD' AND cc.currency = e.currency AND cc.updated_at > now() - interval '7 days' LOOP
    SELECT sum(x.amt), sum(x.rev) INTO cust, stmt FROM (
      SELECT r.month, sum(r.amount) AS amt, max((s.lines->>'revenue')::numeric) AS rev
        FROM financials.customer_revenue r JOIN financials.statements s ON s.entity_id = c.ent AND s.period_type = 'month' AND s.currency = c.cur
         AND date_trunc('month', s.period_end) = r.month AND (s.lines->>'revenue') IS NOT NULL
       WHERE r.entity_id = c.ent GROUP BY r.month) x;
    CONTINUE WHEN stmt IS NULL OR stmt <= 0 OR cust / stmt < 200 OR cust / stmt > 5000;
    FOR m IN SELECT DISTINCT month FROM financials.customer_revenue WHERE entity_id = c.ent LOOP
      rate := coalesce(
        (SELECT per_usd FROM fx.monthly WHERE organization_id = c.org AND quote = c.cur ORDER BY (month > m.month), abs(month - m.month) LIMIT 1),
        (SELECT per_usd FROM fx.history WHERE quote = c.cur AND month = m.month),
        (SELECT per_usd FROM fx.rates WHERE quote = c.cur));
      CONTINUE WHEN rate IS NULL OR rate <= 0;
      UPDATE financials.customer_revenue SET amount = round(amount / rate, 2) WHERE entity_id = c.ent AND month = m.month;
    END LOOP;
    rate := coalesce((SELECT per_usd FROM fx.monthly WHERE organization_id = c.org AND quote = c.cur ORDER BY month DESC LIMIT 1), (SELECT per_usd FROM fx.rates WHERE quote = c.cur));
    IF rate > 0 THEN UPDATE financials.customers SET acquisition_cost = round(acquisition_cost / rate, 2) WHERE entity_id = c.ent AND acquisition_cost IS NOT NULL; END IF;
    DELETE FROM financials.analyses WHERE organization_id = c.org AND (subject LIKE 'customers:%' OR subject LIKE 'advice:%');
    n := n + 1;
    RAISE NOTICE 'customer revenue of % put back into % (it was % times its Financials revenue)', c.name, c.cur, round(cust / stmt);
  END LOOP;
  RAISE NOTICE '% compan% repaired', n, CASE WHEN n = 1 THEN 'y' ELSE 'ies' END;
END $fix$;
