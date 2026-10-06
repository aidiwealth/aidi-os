export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  return (await db().query("SELECT a.id, a.status, a.amount::float, a.currency FROM credit.applications a WHERE a.pitch_id = $1", [id])).rows[0] ?? null
})
