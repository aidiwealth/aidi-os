// What figures can be recorded for: entities and funds, and companies (portfolio and group companies).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  // Funds and SPVs are listed only once they have figures here (a fund like the Angel Fund is not an operating company
  // with its own accounts); companies and entities always are.
  const e = await db().query("SELECT e.id, e.name, e.kind FROM core.entities e WHERE e.status <> 'closed' AND (e.kind NOT IN ('fund','spv') OR EXISTS (SELECT 1 FROM financials.statements s WHERE s.entity_id = e.id)) ORDER BY (e.kind IN ('fund','spv')) DESC, e.name")
  const c = await db().query("SELECT id, name, relationship FROM portfolio.companies ORDER BY (relationship = 'subsidiary') DESC, name")
  const cur = await db().query<{ currency: string }>('SELECT DISTINCT currency FROM financials.statements ORDER BY 1')
  const org = (await currentOrg())!
  const rep = org.settings.reporting_currency as string | undefined
  const company = org.kind === 'company' ? { subject: 'entity:' + (await companyEntityId()), name: org.name, currency: (org.settings.currency as string) || 'USD', reporting: rep || null, rate_as_of: rep ? (await fxRates()).asOf : null } : null
  // A company's own Financials pages: the company first, then its subsidiaries (each with its name and currency).
  const pages = org.kind === 'company' ? (await db().query<{ id: string; name: string; currency: string | null; main: boolean }>("SELECT id, name, currency, parent_id IS NULL AS main FROM core.entities WHERE kind = 'operating' AND status <> 'closed' ORDER BY (parent_id IS NOT NULL), created_at")).rows : []
  if (company && pages[0]?.main) company.name = pages[0].name
  return { company, pages, paid: org.kind === 'company' && org.plan_code !== 'company_free', entities: e.rows, companies: c.rows, currencies: cur.rows.map((r) => r.currency), lines: LINES, derived: DERIVED }
})
