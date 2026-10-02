export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const r = await db().query<{ id: string; name: string; kind: string; status: string }>('SELECT id, name, kind, status FROM core.entities ORDER BY name')
  return r.rows
})
