import { cycleFor, yearOf } from '~/shared/plan-billing'
// Company settings: profile, notifications, and plan with prices in the company's currency.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  if (org.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const s = org.settings as Record<string, unknown>
  const o = (await asPlatform(() => db().query<{ status: string; trial_ends_at: string | null; plan_code: string }>("SELECT status, to_char(trial_ends_at, 'YYYY-MM-DD') AS trial_ends_at, plan_code FROM core.organizations WHERE id = $1", [org.id]))).rows[0]!
  const plans = (await asPlatform(() => db().query("SELECT code, name, description, seat_limit, price_monthly_usd::float AS usd, price_monthly_ngn::float AS ngn, ai_session_tokens::float AS ai_s, ai_weekly_tokens::float AS ai_w FROM core.plans WHERE code LIKE 'company\\_%' AND active AND (public OR code = $1) ORDER BY sort", [o.plan_code]))).rows
  const pb = await planBilling()
  for (const p of plans as { usd: number | null; ngn: number | null; usd_year?: number | null; ngn_year?: number | null }[]) { p.usd_year = p.usd != null ? yearOf(p.usd, pb.annual_discount_pct) : null; p.ngn_year = p.ngn != null ? yearOf(p.ngn, pb.annual_discount_pct) : null }
  const members = await one<{ n: number }>("SELECT count(*)::int AS n FROM core.memberships WHERE status = 'active'")
  return { reporting_currency: (org.settings.reporting_currency as string) || '', name: org.name, website: (s.website as string) ?? '', country: (s.country as string) ?? '', currency: (s.currency as string) ?? 'USD', entity_type: (s.entity_type as string) ?? '', state: (s.state as string) ?? '',
    notify_emails: (s.notify_emails as string[] | undefined) ?? [], plan: o.plan_code, price: await planPrice(org.id).catch(() => null), billing: pb, cycle: cycleFor(pb, s.billing_cycle), status: o.status, trial_ends_at: o.trial_ends_at, trial_used: !!s.trial_used || o.status === 'trial', plans, members: members.n, types: ENTITY_TYPES, states: US_STATES }
})
