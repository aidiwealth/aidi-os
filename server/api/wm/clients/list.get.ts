export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  return (await db().query('SELECT id, name, country FROM wm.clients ORDER BY name')).rows
})
