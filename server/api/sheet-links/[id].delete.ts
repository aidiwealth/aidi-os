// Unlink a sheet. Figures already brought in stay where they are.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = getRouterParam(event, 'id')
  const r = await db().query('DELETE FROM financials.sheet_links WHERE id = $1', [id])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'sheet_link.delete', objectType: 'sheet_link', objectId: id })
  return { ok: true }
})
