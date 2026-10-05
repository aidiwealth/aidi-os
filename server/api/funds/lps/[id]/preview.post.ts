// A 30-minute preview link to this LP's portal (read-only; their own link is unchanged).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('SELECT 1 FROM funds.lps WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'funds.lp_portal_preview', objectType: 'lp', objectId: id })
  return { url: '/lp/' + lpPreviewToken(id) }
})
