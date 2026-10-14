// One cap table (?ct=, else the main one): share classes, holders, issuances, option plans and grants, SAFEs and notes,
// plus the list of the company's cap tables and SAFEs drafted in Fundraising that are not on this one yet.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const ct = await capTableId(getQuery(event).ct)
  const d = await loadCapTable(ct)
  const safes = (await db().query("SELECT s.id, s.investor_name, s.amount::float, s.currency, s.valuation_cap::float, s.discount::float, to_char(s.safe_date, 'YYYY-MM-DD') AS safe_date FROM fundraise.safes s WHERE NOT EXISTS (SELECT 1 FROM equity.convertibles c WHERE c.safe_id = s.id AND c.captable_id = $1) ORDER BY s.safe_date", [ct]).catch(() => ({ rows: [] }))).rows
  return { ...d, safes, captable: ct, captables: await capTables(), company: (await currentOrg())?.name ?? '' }
})
