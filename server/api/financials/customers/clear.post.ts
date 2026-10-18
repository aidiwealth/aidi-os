// Delete all customer data (type DELETE).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = await readBody<{ confirm?: string }>(event)
  if (b?.confirm !== 'DELETE') throw apiError('confirm', 'Type DELETE to remove all customer data.', 422)
  const n = (await db().query('DELETE FROM financials.customers')).rowCount ?? 0
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%'")
  await audit({ event, actorUserId: user.userId, action: 'customers.clear', objectType: 'customer', detail: { removed: n } })
  return { ok: true, removed: n }
})
