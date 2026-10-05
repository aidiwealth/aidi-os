export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'family')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  return (await db().query("SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, value::float, note FROM wealth.valuations WHERE holding_id = $1 ORDER BY as_of", [id])).rows
})
