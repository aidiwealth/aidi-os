import { cycleFor } from '~/shared/plan-billing'
// Change plan: Free, Startup, Medium or Scale, billed monthly or yearly (the Finvry team sets which, and the yearly discount).
// The rules for trials, charges and downgrades are in movePlan (server/utils/plan-change.ts).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ plan: z.enum(['company_free', 'company_startup', 'company_medium', 'company_scale']), cycle: z.enum(['month', 'year']).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a plan.')
  const to = b.data.plan
  // Monthly or yearly, when the Finvry team offers both.
  if (b.data.cycle) {
    const pb = await planBilling()
    if (pb.cycles !== 'both' && cycleFor(pb, b.data.cycle) !== b.data.cycle) throw apiError('invalid', 'Plans are billed ' + (pb.cycles === 'monthly' ? 'monthly' : 'yearly') + ' only.')
    await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('billing_cycle', $2::text) WHERE id = $1", [org.id, b.data.cycle]))
    if (to === org.plan_code) { await syncPlanSubscription(org.id); await audit({ event, actorUserId: user.userId, action: 'company.billing_cycle', objectType: 'organization', objectId: org.id, detail: { cycle: b.data.cycle } }); return { ok: true } }
  }
  if (to === org.plan_code) return { ok: true }
  const { charged } = await movePlan({ orgId: org.id, to, userId: user.userId, event, remember: true })
  return { ok: true, charged_minor: charged }
})
