// Settings: this workspace's partner discount, if any.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'admin')
  const org = (await currentOrg())!
  const d = await planDiscount(org.id)
  return { discount: d }
})
