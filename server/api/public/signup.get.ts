import { yearOf } from '~/shared/plan-billing'
// The sign-up wizard and finvry.com pricing: company plans with naira and dollar prices.
export default defineEventHandler(async (event) => {
  if (handleCors(event, { origin: ['https://finvry.com', 'https://www.finvry.com', 'http://localhost:8080'], methods: ['GET', 'OPTIONS'] })) return
  setResponseHeader(event, 'cache-control', 'no-cache')
  const r = await asPlatform(() => db().query("SELECT code, name, description, seat_limit, price_monthly_usd::float AS usd, price_monthly_ngn::float AS ngn, price_annual_usd::float AS usd_year, price_annual_ngn::float AS ngn_year FROM core.plans WHERE code LIKE 'company\\_%' AND public AND active ORDER BY sort"))
  // Sign-up mode, and the invitation's details when the link carries one (to fill in the form).
  const acc = await accessSettings()
  const t = String(getQuery(event).invite ?? '')
  const inv = t ? await inviteFor(t) : null
  // Yearly prices are twelve months less the yearly discount, worked out here so finvry.com and the app always agree.
  const pb = await planBilling()
  const plans = (r.rows as { usd: number | null; ngn: number | null }[]).map((p) => ({ ...p, usd_year: p.usd != null ? yearOf(p.usd, pb.annual_discount_pct) : null, ngn_year: p.ngn != null ? yearOf(p.ngn, pb.annual_discount_pct) : null }))
  return { plans, billing: pb, mode: acc.mode, invite: inv ? { name: inv.name, email: inv.email, company: inv.company, country: inv.country } : t ? false : null }
})
