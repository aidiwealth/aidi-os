// Change plan. Moving to Free is immediate. The first move to a paid plan starts a 14-day free trial; after that, we
// arrange billing with you (card and Paystack billing at the end of the trial are being switched on).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ plan: z.enum(['company_free', 'company_startup', 'company_scale']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a plan.')
  const s = org.settings as Record<string, unknown>
  const trialUsed = !!s.trial_used || org.status === 'trial'
  if (b.data.plan === 'company_free') await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = 'company_free', status = 'active', trial_ends_at = NULL WHERE id = $1", [org.id]))
  else if (org.status === 'trial') await asPlatform(() => db().query('UPDATE core.organizations SET plan_code = $2 WHERE id = $1', [org.id, b.data.plan]))
  else if (!trialUsed) await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = $2, status = 'trial', trial_ends_at = now() + interval '14 days', settings = settings || '{\"trial_used\": true}'::jsonb WHERE id = $1", [org.id, b.data.plan]))
  else if (org.status === 'trial') await asPlatform(() => db().query('UPDATE core.organizations SET plan_code = $2 WHERE id = $1', [org.id, b.data.plan]))
  else throw apiError('billing', 'Your free trial has been used. Email support@finvry.com and we will set up billing for you.', 402)
  await syncPlanSubscription(org.id)
  await audit({ event, actorUserId: user.userId, action: 'company.plan', objectType: 'organization', objectId: org.id, detail: { plan: b.data.plan } })
  return { ok: true }
})
