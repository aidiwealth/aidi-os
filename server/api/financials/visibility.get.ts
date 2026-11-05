// What investors currently see about the figures (for the founder's settings card and preview).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const org = (await currentOrg())!
  const links = (await db().query("SELECT id, name, url, show_source FROM financials.sheet_links WHERE target = 'financials' ORDER BY created_at").catch(() => ({ rows: [] }))).rows
  const ent = await companyEntityId().catch(() => null)
  const hasSec = ent ? !!(await db().query("SELECT 1 FROM financials.statements WHERE coalesce((lines->>'investments')::numeric, 0) <> 0 LIMIT 1").catch(() => ({ rowCount: 0 }))).rowCount : false
  const pick = org.settings.investor_cash_with_securities
  // SAFE or convertible notes among the categories: the founder chooses whether they show in equity or liabilities.
  const hasSafe = !!(await db().query("SELECT 1 FROM financials.statements s, jsonb_object_keys(coalesce(s.detail, '{}'::jsonb)) k WHERE k ~* '\\msafes?\\M|convertible|vc funding|simple agreement for future equity' LIMIT 1").catch(() => ({ rowCount: 0 }))).rowCount
  // No SAFE category: the part of a company's "Other liabilities" that no category explains, at its latest month, so the
  // founder can say that is the SAFEs.
  const rest = hasSafe ? [] : (await db().query<{ entity_id: string; name: string; period_end: string; lines: Record<string, number>; detail: Record<string, number> | null; currency: string }>(
    `SELECT DISTINCT ON (s.entity_id) s.entity_id, e.name, to_char(s.period_end, 'YYYY-MM-DD') AS period_end, s.lines, s.detail, s.currency FROM financials.statements s JOIN core.entities e ON e.id = s.entity_id
      WHERE s.period_type = 'month' AND s.lines ? 'other_liabilities' ORDER BY s.entity_id, s.period_end DESC`).catch(() => ({ rows: [] }))).rows
    .map((x) => ({ entity_id: x.entity_id, name: x.name, period_end: x.period_end, currency: x.currency, amount: otherLiabRest(x.lines, x.detail) })).filter((x) => x.amount >= 1)
  const safeRest = typeof org.settings.safe_rest === 'string' ? org.settings.safe_rest : null
  const safe = org.settings.safe_treatment === 'equity' || org.settings.safe_treatment === 'liability' ? org.settings.safe_treatment : null
  return { summary: org.settings.investor_fin_summary === true, links, preview: await investorFinancials(), company: org.kind === 'company', has_securities: hasSec, securities: typeof pick === 'boolean' ? pick : null, has_safe: hasSafe, safe, safe_rest: safeRest, rest_options: rest }
})
