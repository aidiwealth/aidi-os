// Remove a category that no linked sheet uses (its figures stay in past periods as a detail).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  const id = String(getRouterParam(event, 'id') ?? '')
  const a = (await db().query<{ name: string; parent: string }>('SELECT name, parent FROM financials.accounts WHERE id = $1', [id])).rows[0]
  if (!a) throw apiError('not_found', 'Not found', 404)
  const to = JSON.stringify('cat:' + a.parent + ':' + a.name)
  if ((await db().query("SELECT 1 FROM financials.sheet_links WHERE mapping::text LIKE '%' || $1 || '%' OR coalesce(ai_map::text, '') LIKE '%' || $1 || '%'", [to])).rowCount) throw apiError('in_use', 'A linked sheet uses this category. Change that row first, or rename the category.', 409)
  await db().query('DELETE FROM financials.accounts WHERE id = $1', [id])
  await audit({ event, actorUserId: user.userId, action: 'financials.account_remove', objectType: 'account', objectId: id, detail: a })
  return { ok: true }
})
