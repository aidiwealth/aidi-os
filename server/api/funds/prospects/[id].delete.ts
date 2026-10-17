// Remove a prospective LP (and from every pipeline). Their LP register entry, if any, stays.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('DELETE FROM funds.lp_prospects WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_prospect_removed', objectType: 'lp_prospect', objectId: id })
  return { ok: true }
})
