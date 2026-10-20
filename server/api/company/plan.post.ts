import { cycleFor } from '~/shared/plan-billing'
// Change plan (Startup, Medium or Scale, billed monthly or yearly — the Finvry team sets which, and the yearly discount). The first move to a paid plan starts a 14-day free trial; after that, we
// arrange billing with you (card and Paystack billing at the end of the trial are being switched on).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ plan: z.enum(['company_startup', 'company_medium', 'company_scale']), cycle: z.enum(['month', 'year']).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a plan.')
  const s = org.settings as Record<string, unknown>
  // Monthly or yearly, when the Finvry team offers both.
  if (b.data.cycle) {
    const pb = await planBilling()
    if (pb.cycles !== 'both' && cycleFor(pb, b.data.cycle) !== b.data.cycle) throw apiError('invalid', 'Plans are billed ' + (pb.cycles === 'monthly' ? 'monthly' : 'yearly') + ' only.')
    await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('billing_cycle', $2::text) WHERE id = $1", [org.id, b.data.cycle]))
    if (b.data.plan === org.plan_code) { await syncPlanSubscription(org.id); await audit({ event, actorUserId: user.userId, action: 'company.billing_cycle', objectType: 'organization', objectId: org.id, detail: { cycle: b.data.cycle } }); return { ok: true } }
  }
  const trialUsed = !!s.trial_used || org.status === 'trial'
  if (org.status === 'trial') await asPlatform(() => db().query('UPDATE core.organizations SET plan_code = $2 WHERE id = $1', [org.id, b.data.plan]))
  else if (!trialUsed) await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = $2, status = 'trial', trial_ends_at = now() + interval '14 days', settings = settings || '{\"trial_used\": true}'::jsonb WHERE id = $1", [org.id, b.data.plan]))
  else if (org.status === 'trial') await asPlatform(() => db().query('UPDATE core.organizations SET plan_code = $2 WHERE id = $1', [org.id, b.data.plan]))
  else throw apiError('billing', 'Your free trial has been used. Email support@finvry.com and we will set up billing for you.', 402)
  await syncPlanSubscription(org.id)
  await audit({ event, actorUserId: user.userId, action: 'company.plan', objectType: 'organization', objectId: org.id, detail: { plan: b.data.plan } })
  return { ok: true }
})
