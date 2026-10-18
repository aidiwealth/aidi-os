-- os202: new standard lines. "investments" now means short-term holdings only (treasury bills, deposits);
-- strategic stakes and long-term holdings move to long_term_investments, which never counts as cash. "interest" is
-- interest expense; interest and dividend income go to other_income. Equity always means total equity: a part of it
-- (paid-in capital, retained earnings...) becomes a category under equity. Saved sheet links are moved over here, so
-- the next sync (daily, or Sync now) writes the figures to the right lines.
CREATE OR REPLACE FUNCTION pg_temp.fix_to(lbl text, t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN t = 'investments' AND lbl ~* '(strateg|stake|associate|subsidiar|long[- ]?term|equity invest|joint venture|^investments?$)' THEN 'long_term_investments'
    WHEN t = 'interest' AND lbl ~* '(income|dividend|earned|received|gain)' THEN 'other_income'
    WHEN t = 'equity' AND lbl !~* 'total' AND lbl ~* '(paid[- ]?in|share capital|capital stock|common stock|preferred stock|share premium|retained|deficit|reserve|treasury|unreali[sz]ed|comprehensive)' THEN 'cat:equity:' || left(regexp_replace(btrim(lbl), '\s+', ' ', 'g'), 80)
    ELSE t END
$$;

UPDATE financials.sheet_links l SET mapping = (
  SELECT jsonb_agg(CASE WHEN e ? 'to' THEN jsonb_set(e, '{to}', to_jsonb(pg_temp.fix_to(coalesce(e->>'label', ''), e->>'to'))) ELSE e END ORDER BY o)
  FROM jsonb_array_elements(l.mapping) WITH ORDINALITY x(e, o))
WHERE l.target = 'financials' AND jsonb_typeof(l.mapping) = 'array' AND jsonb_array_length(l.mapping) > 0;

UPDATE financials.sheet_links l SET ai_map = jsonb_set(l.ai_map, '{blocks}', (
  SELECT jsonb_agg(CASE WHEN jsonb_typeof(b->'rows') = 'array' AND jsonb_array_length(b->'rows') > 0 THEN jsonb_set(b, '{rows}', (
      SELECT jsonb_agg(CASE WHEN r ? 'to' THEN jsonb_set(r, '{to}', to_jsonb(pg_temp.fix_to(coalesce(r->>'label', ''), r->>'to'))) ELSE r END ORDER BY o2)
      FROM jsonb_array_elements(b->'rows') WITH ORDINALITY y(r, o2))) ELSE b END ORDER BY o1)
  FROM jsonb_array_elements(l.ai_map->'blocks') WITH ORDINALITY x(b, o1)))
WHERE l.mode = 'ai' AND jsonb_typeof(l.ai_map->'blocks') = 'array' AND jsonb_array_length(l.ai_map->'blocks') > 0;
