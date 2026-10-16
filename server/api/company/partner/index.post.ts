// Settings: redeem a partner code (from your VC, incubator, accelerator or community) for a discount on your plan.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp', 'admin')
  await rateLimit('partner_redeem', user.userId, 10, 60 * 60 * 1000)
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ code: z.string().max(40) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('bad_code', 'Enter your partner code.')
  const r = await redeemPartnerCode(org.id, b.data.code)
  await audit({ event, actorUserId: user.userId, action: 'company.partner_code', objectType: 'organization', objectId: org.id, detail: r })
  return { ok: true, ...r }
})
