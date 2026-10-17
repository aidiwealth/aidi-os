// Remove the company logo.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  await setCompanyLogo(null)
  await audit({ event, actorUserId: user.userId, action: 'company.logo_removed', objectType: 'organization' })
  return { ok: true }
})
