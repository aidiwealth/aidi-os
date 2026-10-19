// What investors currently see about the figures (for the founder's settings card and preview).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const org = (await currentOrg())!
  const links = (await db().query("SELECT id, name, url, show_source FROM financials.sheet_links WHERE target = 'financials' ORDER BY created_at").catch(() => ({ rows: [] }))).rows
  const ent = await companyEntityId().catch(() => null)
  const hasSec = ent ? !!(await db().query("SELECT 1 FROM financials.statements WHERE coalesce((lines->>'investments')::numeric, 0) <> 0 LIMIT 1").catch(() => ({ rowCount: 0 }))).rowCount : false
  const pick = org.settings.investor_cash_with_securities
  return { summary: org.settings.investor_fin_summary === true, links, preview: await investorFinancials(), company: org.kind === 'company', has_securities: hasSec, securities: typeof pick === 'boolean' ? pick : null }
})
