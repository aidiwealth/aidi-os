// Re-read the linked sheet now.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await rateLimit('customer_sync', user.userId, 30, 60 * 60 * 1000)
  const r = await syncCustomerLink()
  await audit({ event, actorUserId: user.userId, action: 'customers.sync', objectType: 'customer_config', detail: r })
  return { ok: true, ...r }
})
