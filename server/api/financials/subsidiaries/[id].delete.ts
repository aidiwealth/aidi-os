// Remove a subsidiary and its figures (the company itself cannot be removed here).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('invalid', 'Not found')
  const e = (await db().query<{ name: string }>("SELECT name FROM core.entities WHERE id = $1 AND kind = 'operating' AND parent_id IS NOT NULL", [id])).rows[0]
  if (!e) throw apiError('not_found', 'Only subsidiaries can be removed.', 404)
  const n = (await db().query('DELETE FROM financials.statements WHERE entity_id = $1', [id])).rowCount ?? 0
  await db().query("DELETE FROM financials.sheet_links WHERE target = 'financials' AND subject = $1", ['entity:' + id])
  try { await db().query('DELETE FROM core.entities WHERE id = $1', [id]) } catch { await db().query("UPDATE core.entities SET status = 'closed' WHERE id = $1", [id]) }
  await audit({ event, actorUserId: user.userId, action: 'financials.subsidiary_remove', objectType: 'entity', objectId: id, detail: { name: e.name, statements: n } })
  return { ok: true }
})
