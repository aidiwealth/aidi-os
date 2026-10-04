// Remove the saved card (automatic charges then come from the wallet only).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = (await currentOrg())!
  await asPlatform(() => db().query('DELETE FROM platform.payment_methods WHERE organization_id = $1', [org.id]))
  await audit({ event, actorUserId: user.userId, action: 'wallet.card_removed', objectType: 'organization', objectId: org.id })
  return { ok: true }
})
