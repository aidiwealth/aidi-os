-- Mercury (Wefunder SPV, priced Series B round): $1,000 invested 9 Oct 2021, now a portfolio company of Aidi Angel
-- Fund. Recorded as a Secondaries deal (invested), a Secondaries holding of Aidi Angel Fund valued at $5,467.11
-- (15 Oct 2026, 5.47x), and linked to the Mercury portfolio company if one exists. Safe to run more than once.
DO $mercury$
DECLARE org uuid; fund uuid; sec uuid; hold uuid; pc uuid;
BEGIN
  SELECT id INTO org FROM core.organizations WHERE plan_code = 'internal' ORDER BY created_at LIMIT 1;
  IF org IS NULL THEN RAISE NOTICE 'No Aidi OS workspace found'; RETURN; END IF;
  SELECT id INTO fund FROM core.entities WHERE organization_id = org AND name ILIKE 'Aidi Angel Fund%' ORDER BY length(name) LIMIT 1;
  SELECT id INTO pc FROM portfolio.companies WHERE organization_id = org AND lower(name) IN ('mercury', 'mercury technologies', 'mercury technologies inc', 'mercury inc') LIMIT 1;
  SELECT id INTO sec FROM wm.secondaries WHERE organization_id = org AND source = 'wefunder' AND ref = 'mercury';
  IF sec IS NULL THEN
    INSERT INTO wm.secondaries (organization_id, source, ref, title, company, sector, stage, lead, co_investors, valuation, url, received_at, status, amount, fits, client_visible, notes, portfolio_company_id)
    VALUES (org, 'wefunder', 'mercury', 'Banking stack for startups', 'Mercury', 'Fintech', 'Series B', 'Coatue', 'Andreessen Horowitz, CRV, Sapphire', '$120M raised at $1.62B valuation', 'https://wefunder.com/mercury',
      '2021-10-09', 'invested', 1000, true, false,
      'Invested through a Wefunder SPV in the priced round (entry pre-money about $1.455B). Rounds: Series A $43.2M at $78.7M pre; Series B $164.9M at $1.455B pre; Series C $300M at $3.2B pre; Series D $200M at $5.0B pre. Value 15 Oct 2026: $5,467.11 (5.47x).', pc)
    RETURNING id INTO sec;
  ELSE
    UPDATE wm.secondaries SET status = 'invested', amount = 1000, portfolio_company_id = coalesce(portfolio_company_id, pc) WHERE id = sec;
  END IF;
  SELECT id INTO hold FROM wealth.holdings WHERE organization_id = org AND (meta->>'secondary_id' = sec::text OR (lower(name) LIKE 'mercury%' AND status NOT IN ('sold', 'written_off'))) ORDER BY (meta->>'secondary_id' = sec::text) DESC NULLS LAST LIMIT 1;
  IF hold IS NULL THEN
    INSERT INTO wealth.holdings (organization_id, entity_id, section, category, name, platform, currency, cost, current_value, as_of, status, notes, meta)
    VALUES (org, fund, 'venture', 'secondaries', 'Mercury', 'Secondaries', 'USD', 1000, 5467.11, '2026-10-15', 'active', 'Fintech · Series B · Wefunder SPV', jsonb_build_object('secondary_id', sec::text, 'invested_on', '2021-10-09'));
  ELSE
    UPDATE wealth.holdings SET category = 'secondaries', entity_id = coalesce(entity_id, fund), cost = coalesce(cost, 1000), current_value = 5467.11, as_of = '2026-10-15', status = 'active',
      meta = meta || jsonb_build_object('secondary_id', sec::text, 'invested_on', coalesce(meta->>'invested_on', '2021-10-09')) WHERE id = hold;
  END IF;
  RAISE NOTICE 'Mercury: secondary %, fund %, portfolio company %', sec, coalesce(fund::text, 'not found'), coalesce(pc::text, 'not found (use Add to Portfolio on the deal)');
END $mercury$;
