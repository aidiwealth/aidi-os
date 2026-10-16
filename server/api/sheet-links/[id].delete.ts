// Unlink a sheet. Figures already brought in stay where they are.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = getRouterParam(event, 'id')
  const on = await enabledModules(), targets = ['financials', 'forecast'].filter((t) => on.has(t))
  const r = await db().query('DELETE FROM financials.sheet_links WHERE id = $1 AND target = ANY($2::text[])', [id, targets])
  if (!r.rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'sheet_link.delete', objectType: 'sheet_link', objectId: id })
  return { ok: true }
})
