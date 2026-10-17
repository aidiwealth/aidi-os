// Remove a right (the letter stays in Documents).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await db().query('DELETE FROM equity.rights WHERE id = $1', [id])).rowCount) throw apiError('not_found', 'Not found', 404)
  await audit({ event, actorUserId: user.userId, action: 'equity.right_removed', objectType: 'right', objectId: id })
  return { ok: true }
})
