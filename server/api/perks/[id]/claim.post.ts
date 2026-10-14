// Claim a perk for this company: records it and reveals the code, link and how to redeem.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const org = await currentOrg()
  if (org?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw apiError('not_found', 'Not found', 404)
  const p = (await asPlatform(() => db().query<PerkRow>('SELECT ' + PERK_COLS + ' FROM core.perks WHERE id = $1 AND ' + LIVE, [id.data]))).rows[0]
  if (!p) throw apiError('not_found', 'This perk is no longer available.', 404)
  if (p.audience === 'paid' && !(await onPaidPlan())) throw apiError('upgrade', 'This perk is for companies on a paid plan. Upgrade your plan in Settings to unlock it.', 403)
  await db().query('INSERT INTO core.perk_claims (perk_id, user_id) VALUES ($1, $2) ON CONFLICT (perk_id, organization_id) DO NOTHING', [p.id, user.userId])
  await audit({ event, actorUserId: user.userId, action: 'perk.claimed', objectType: 'perk', objectId: p.id, detail: { partner: p.partner } })
  return { ok: true, redeem: p.redeem, code: p.code, claim_url: p.claim_url }
})
