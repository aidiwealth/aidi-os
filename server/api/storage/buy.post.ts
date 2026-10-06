// Buy a storage pack from the wallet: +10 GB for 30 days, renewing automatically while the wallet can pay.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const org = (await currentOrg())!
  const w = await walletOf(org.id)
  const price = w.currency === 'NGN' ? STORAGE_PACK.ngn : STORAGE_PACK.usd
  await postLedger(org.id, 'debit', Math.round(price * 100), 'subscription', 'Storage +' + STORAGE_PACK.gb + ' GB (30 days)', { userId: user.userId })
  await db().query("INSERT INTO core.storage_addons (organization_id, gb, price_minor, currency, expires_at, created_by) VALUES ($1,$2,$3,$4, now() + interval '30 days', $5)", [org.id, STORAGE_PACK.gb, Math.round(price * 100), w.currency, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'storage.buy', objectType: 'organization', objectId: org.id })
  return { ok: true }
})
