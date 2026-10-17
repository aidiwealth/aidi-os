// What investors currently see about the figures (for the founder's settings card and preview).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'admin')
  const org = (await currentOrg())!
  const links = (await db().query("SELECT id, name, url, show_source FROM financials.sheet_links WHERE target = 'financials' ORDER BY created_at").catch(() => ({ rows: [] }))).rows
  return { summary: org.settings.investor_fin_summary === true, links, preview: await investorFinancials(), company: org.kind === 'company' }
})
