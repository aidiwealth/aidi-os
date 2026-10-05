// What figures can be recorded for: entities and funds, and companies (portfolio and group companies).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const e = await db().query("SELECT id, name, kind FROM core.entities WHERE status <> 'closed' ORDER BY (kind IN ('fund','spv')) DESC, name")
  const c = await db().query("SELECT id, name, relationship FROM portfolio.companies ORDER BY (relationship = 'subsidiary') DESC, name")
  const cur = await db().query<{ currency: string }>('SELECT DISTINCT currency FROM financials.statements ORDER BY 1')
  const org = (await currentOrg())!
  const rep = org.settings.reporting_currency as string | undefined
  const company = org.kind === 'company' ? { subject: 'entity:' + (await companyEntityId()), name: org.name, currency: (org.settings.currency as string) || 'USD', reporting: rep || null, rate_as_of: rep ? (await fxRates()).asOf : null } : null
  return { company, entities: e.rows, companies: c.rows, currencies: cur.rows.map((r) => r.currency), lines: LINES, derived: DERIVED }
})
