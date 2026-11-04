import type { H3Event } from 'h3'
// Moving a company to another plan, from Settings or the paywall, and again on its own once a top-up lands for a plan
// the wallet could not pay for (the plan waits in settings.pending_plan for 14 days).
//  - The first move to a paid plan starts a 14-day free trial; during the trial any plan can be chosen.
//  - After the trial, from Free (or a lapsed plan) to a paid plan: the first period is paid now, from the wallet, else the card on file;
//    a higher paid plan: the difference for the rest of the current period is paid now; the new price applies from the next charge;
//    a lower plan, or Free: takes effect now, nothing is charged (no refund for the rest of the period).
const ORDER = ['company_free', 'company_startup', 'company_medium', 'company_scale']
const PLAN_NAME_S: Record<string, string> = { company_free: 'Free', company_startup: 'Startup', company_medium: 'Medium', company_scale: 'Scale' }
export async function movePlan(o: { orgId: string; to: string; userId: string | null; event?: H3Event; remember?: boolean; walletOnly?: boolean }): Promise<{ charged: number }> {
  const org = (await asPlatform(() => db().query<{ id: string; name: string; status: string; plan_code: string; settings: Record<string, unknown> }>('SELECT id, name, status, plan_code, settings FROM core.organizations WHERE id = $1', [o.orgId]))).rows[0]
  if (!org) throw apiError('not_found', 'Not found', 404)
  const s = org.settings ?? {}, to = o.to, free = to === 'company_free', userId = o.userId
  if (to === org.plan_code) return { charged: 0 }
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
        const c = o.walletOnly ? { ok: false } : await chargeCardIntoWallet(org.id, charged - w.balance_minor, pp.currency, reason)
        if (!c.ok) {
          if (o.remember) await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings || jsonb_build_object('pending_plan', jsonb_build_object('plan', $2::text, 'by', $3::text, 'at', now())) WHERE id = $1", [org.id, to, userId]))
          throw apiError('billing', 'Add ' + money(charged - w.balance_minor, pp.currency) + ' to your wallet, or add a card, to move to ' + pp.name + '. It costs ' + money(charged, pp.currency) + ' now and your wallet has ' + money(w.balance_minor, w.currency) + '.' + (o.remember ? ' Top up and we move you to ' + pp.name + ' as soon as the money lands.' : ''), 402)
        }
      }
      await postLedger(org.id, 'debit', charged, 'subscription', reason, { reference: 'plan:' + org.id + ':' + to + ':' + new Date().toISOString().slice(0, 16), userId: userId })
    }
    await asPlatform(() => db().query("UPDATE core.organizations SET plan_code = $2, status = 'active', trial_ends_at = NULL WHERE id = $1", [org.id, to]))
  }
  await syncPlanSubscription(org.id)
  await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings - 'pending_plan' WHERE id = $1", [org.id]))
  clearModuleCache() // the new plan's pages unlock (or lock) on the next load, not 30 seconds later
  // A plan paid now from scratch renews one period from today (not today again).
  if (fresh) await asPlatform(() => db().query("UPDATE wallet.subscriptions SET next_charge_at = current_date + CASE WHEN interval = 'month' THEN interval '1 month' ELSE interval '1 year' END, started_on = current_date, overdue_since = NULL, failures = 0, last_error = NULL, updated_at = now() WHERE organization_id = $1 AND kind = 'plan' AND status = 'active'", [org.id]))
  await audit({ event: o.event, actorUserId: userId, action: 'company.plan', objectType: 'organization', objectId: org.id, detail: { plan: to, from: org.plan_code, charged_minor: charged } })
  if (charged) slack('finvry.renewal', org.name + ' moved to ' + (PLAN_NAME_S[to] ?? to) + ' and paid ' + money(charged, (await walletOf(org.id)).currency), [['From', PLAN_NAME_S[org.plan_code] ?? org.plan_code]], { label: 'Subscriptions', path: '/platform/billing', brand: 'aidi' })
  return { charged }
}
// Money just landed in the wallet: if the company tried to move to a plan in the last 14 days and the wallet was short,
// move it now when the wallet covers it (wallet only, no card). Never throws.
export async function completePendingPlan(orgId: string): Promise<void> {
  try {
    const p = (await asPlatform(() => db().query<{ plan: string | null; by: string | null; fresh: boolean }>(
      "SELECT settings->'pending_plan'->>'plan' AS plan, settings->'pending_plan'->>'by' AS by, coalesce((settings->'pending_plan'->>'at')::timestamptz > now() - interval '14 days', false) AS fresh FROM core.organizations WHERE id = $1 AND kind = 'company'", [orgId]))).rows[0]
    if (!p?.plan) return
    if (!p.fresh || !ORDER.includes(p.plan)) { await asPlatform(() => db().query("UPDATE core.organizations SET settings = settings - 'pending_plan' WHERE id = $1", [orgId])); return }
    await movePlan({ orgId, to: p.plan, userId: p.by, walletOnly: true })
  } catch (err) { console.error('[plan] pending move not done', orgId, (err as Error).message) }
}
