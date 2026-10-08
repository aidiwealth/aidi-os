export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  return (await db().query('SELECT id, code, name, description, billing, price::text, price_ngn::text, cost::text, fee::text, cost_ngn::text, fee_ngn::text, cost_label, public, region, currency, formation, active, sort FROM services.catalog ORDER BY active DESC, sort, name')).rows
})
