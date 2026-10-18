// Remove one customer and its months.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const id = String(getRouterParam(event, 'id'))
  await db().query('DELETE FROM financials.customers WHERE id = $1', [id])
  await audit({ event, actorUserId: user.userId, action: 'customers.delete', objectType: 'customer', objectId: id })
  return { ok: true }
})
