// Delete an LP pipeline (the prospects and any LP register entries stay).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('DELETE FROM funds.lp_pipelines WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_pipeline_deleted', objectType: 'lp_pipeline', objectId: id })
  return { ok: true }
})
