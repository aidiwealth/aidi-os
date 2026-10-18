// Customer revenue (for Retention and Customers): settings, customers with their months, Financials revenue to
// reconcile against, and recent uploads.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const config = await customerConfig()
  const [customers, fin, imports] = await Promise.all([loadCustomers(), financialsRevenue(config.currency),
    db().query(`SELECT id, filename, status, summary, to_char(created_at, 'YYYY-MM-DD') AS created FROM financials.customer_imports WHERE status = 'applied' ORDER BY created_at DESC LIMIT 5`)])
  return { config, customers, fin, imports: imports.rows }
})
