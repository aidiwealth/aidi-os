export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query('SELECT id, name, country, sector FROM credit.borrowers ORDER BY name')).rows
})
