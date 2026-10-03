export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const r = await db().query('SELECT id, name, contact_name, email FROM services.clients ORDER BY name')
  return r.rows
})
