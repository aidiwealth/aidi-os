export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  return (await db().query('SELECT id, code, name, description, billing, price::text, currency, formation, active, sort FROM services.catalog ORDER BY active DESC, sort, name')).rows
})
