// Customer revenue (for Retention and Customers): settings, customers with their months, Financials revenue to
// reconcile against, and recent uploads.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const config = await customerConfig()
  const [customers, fin, imports] = await Promise.all([loadCustomers(), financialsRevenue(config.currency),
    db().query(`SELECT id, filename, status, summary, to_char(created_at, 'YYYY-MM-DD') AS created FROM financials.customer_imports WHERE status = 'applied' ORDER BY created_at DESC LIMIT 5`)])
  // Thousands of customers by month make a large reply: sent compressed when the browser accepts it.
  // In a group: which company these are (null for the group, every company combined) and each company, with whether
  // it has customer revenue yet.
  const ents = await custEntities()
  const last = new Map((await withAllCompanies(() => db().query<{ e: string; m: string }>("SELECT entity_id AS e, to_char(max(month), 'YYYY-MM') AS m FROM financials.customer_revenue WHERE entity_id IS NOT NULL GROUP BY 1"))).rows.map((r) => [r.e, r.m]))
  // The group is read up to the latest month every company with customer revenue has reached, so a company that is a
  // month behind does not look like lost customers.
  const ms = [...last.values()].sort()
  const scope = { entity: custEntityId(), common_last: ms.length > 1 ? ms[0] : null, entities: ents.map((e) => ({ id: e.id, name: e.name, currency: e.currency, main: e.main, has_data: last.has(e.id), last: last.get(e.id) ?? null })) }
  return sendJsonGz(event, { config, customers, fin, imports: imports.rows, scope })
})
