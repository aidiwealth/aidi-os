// Stop reading the linked sheet (the customers already saved stay).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await db().query('UPDATE financials.customer_config SET link_url = NULL, link_name = NULL, link_error = NULL, link_result = NULL')
  await audit({ event, actorUserId: user.userId, action: 'customers.unlink', objectType: 'customer_config' })
  return { ok: true }
})
