import { cycleFor } from '~/shared/plan-billing'
// Change plan: Free, Startup, Medium or Scale, billed monthly or yearly (the Finvry team sets which, and the yearly discount).
// The first move to a paid plan starts a 14-day free trial; during the trial any plan can be chosen. After the trial:
//  - from Free (or a lapsed plan) to a paid plan: the first period is paid now, from the wallet, else the card on file;
//  - a higher paid plan: the difference for the rest of the current period is paid now; the new price applies from the next charge;
//  - a lower plan, or Free: takes effect now, nothing is charged (no refund for the rest of the period).
import { z } from 'zod'
const ORDER = ['company_free', 'company_startup', 'company_medium', 'company_scale']
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const b = z.object({ plan: z.enum(['company_free', 'company_startup', 'company_medium', 'company_scale']), cycle: z.enum(['month', 'year']).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose a plan.')
  const s = org.settings as Record<string, unknown>
  const to = b.data.plan, free = to === 'company_free'
  // Monthly or yearly, when the Finvry team offers both.
  if (b.data.cycle) {
    const pb = await planBilling()
    if (pb.cycles !== 'both' && cycleFor(pb, b.data.cycle) !== b.data.cycle) throw apiError('invalid', 'Plans are billed ' + (pb.cycles === 'monthly' ? 'monthly' : 'yearly') + ' only.')
    await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('billing_cycle', $2::text) WHERE id = $1", [org.id, b.data.cycle]))
    if (to === org.plan_code) { await syncPlanSubscription(org.id); await audit({ event, actorUserId: user.userId, action: 'company.billing_cycle', objectType: 'organization', objectId: org.id, detail: { cycle: b.data.cycle } }); return { ok: true } }
  }
  if (to === org.plan_code) return { ok: true }
  const trialUsed = !!s.trial_used || org.status === 'trial'
  const money = (minor: number, c: string) => (c === 'NGN' ? '₦' : '$') + (minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  let charged = 0, fresh = false
  if (org.status === 'trial') {
    // During the trial: any plan; Free ends the trial.
    await asPlatform(() => db().query(free ? "UPDATE core.organizations SET plan_code = $2, status = 'active', trial_ends_at = NULL WHERE id = $1" : 'UPDATE core.organizations SET plan_code = $2 WHERE id = $1', [org.id, to]))
  } else if (!trialUsed && !free) {
    await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = $2, status = 'trial', trial_ends_at = now() + interval '14 days', settings = settings || '{\"trial_used\": true}'::jsonb WHERE id = $1", [org.id, to]))
  } else if (free) {
    await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = 'company_free', status = 'active', trial_ends_at = NULL WHERE id = $1", [org.id]))
  } else {
    // Paid plan after the trial: work out what is due now.
    const pp = await asPlatform(() => planPrice(org.id, to))
    if (!pp) throw apiError('invalid', 'Choose a plan.')
    const disc = await planDiscount(org.id)
    const newMinor = pp.free ? 0 : Math.round((disc ? Math.round(pp.list * (100 - disc.pct)) / 100 : pp.list) * 100)
    const cur = (await asPlatform(() => db().query<{ amount: string; next: string; days_left: number; days: number }>(
      "SELECT amount_minor::text AS amount, to_char(next_charge_at, 'YYYY-MM-DD') AS next, (next_charge_at - current_date)::int AS days_left, (next_charge_at - (next_charge_at - CASE WHEN interval = 'month' THEN interval '1 month' ELSE interval '1 year' END)::date)::int AS days FROM wallet.subscriptions WHERE organization_id = $1 AND kind = 'plan' AND status = 'active' AND amount_minor > 0 AND next_charge_at > current_date ORDER BY updated_at DESC LIMIT 1", [org.id]))).rows[0]
    const up = ORDER.indexOf(to) > ORDER.indexOf(org.plan_code)
    if (cur) charged = up ? Math.max(0, Math.round((newMinor - Number(cur.amount)) * Math.min(1, cur.days_left / Math.max(1, cur.days)))) : 0
    else { charged = newMinor; fresh = true }
    if (charged > 0) {
      const reason = pp.name + ' plan' + (fresh ? ' (' + (pp.interval === 'month' ? 'first month' : 'first year') + ')' : ' (upgrade, rest of this period)')
      const w = await walletOf(org.id)
      if (w.currency !== pp.currency) throw apiError('billing', 'Your wallet is in ' + w.currency + '. Email support@finvry.com and we will move your plan for you.', 402)
      if (w.balance_minor < charged) {
        const c = await chargeCardIntoWallet(org.id, charged - w.balance_minor, pp.currency, reason)
        if (!c.ok) throw apiError('billing', 'Add ' + money(charged - w.balance_minor, pp.currency) + ' to your wallet, or add a card, to move to ' + pp.name + '. It costs ' + money(charged, pp.currency) + ' now and your wallet has ' + money(w.balance_minor, w.currency) + '.', 402)
      }
      await postLedger(org.id, 'debit', charged, 'subscription', reason, { reference: 'plan:' + org.id + ':' + to + ':' + new Date().toISOString().slice(0, 16), userId: user.userId })
    }
    await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = $2, status = 'active', trial_ends_at = NULL WHERE id = $1", [org.id, to]))
  }
  await syncPlanSubscription(org.id)
  clearModuleCache() // the new plan's pages unlock (or lock) on the next load, not 30 seconds later
  // A plan paid now from scratch renews one period from today (not today again).
  if (fresh) await asPlatform(() => db().query("UPDATE wallet.subscriptions SET next_charge_at = current_date + CASE WHEN interval = 'month' THEN interval '1 month' ELSE interval '1 year' END, started_on = current_date, overdue_since = NULL, failures = 0, last_error = NULL, updated_at = now() WHERE organization_id = $1 AND kind = 'plan' AND status = 'active'", [org.id]))
  await audit({ event, actorUserId: user.userId, action: 'company.plan', objectType: 'organization', objectId: org.id, detail: { plan: to, from: org.plan_code, charged_minor: charged } })
  if (charged) slack('finvry.renewal', org.name + ' moved to ' + (PLAN_NAME_S[to] ?? to) + ' and paid ' + money(charged, (await walletOf(org.id)).currency), [['From', PLAN_NAME_S[org.plan_code] ?? org.plan_code]], { label: 'Subscriptions', path: '/platform/billing', brand: 'aidi' })
  return { ok: true, charged_minor: charged }
})
const PLAN_NAME_S: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_medium: 'Medium', company_scale: 'Scale' }
