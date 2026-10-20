// The sign-up wizard and finvry.com pricing: company plans with naira and dollar prices.
export default defineEventHandler(async (event) => {
  if (handleCors(event, { origin: ['https://finvry.com', 'https://www.finvry.com', 'http://localhost:8080'], methods: ['GET', 'OPTIONS'] })) return
  setResponseHeader(event, 'cache-control', 'no-cache')
  const r = await asPlatform(() => db().query("SELECT code, name, description, seat_limit, price_monthly_usd::float AS usd, price_monthly_ngn::float AS ngn, price_annual_usd::float AS usd_year, price_annual_ngn::float AS ngn_year FROM core.plans WHERE code LIKE 'company\\_%' AND public AND active ORDER BY sort"))
  // Sign-up mode, and the invitation's details when the link carries one (to fill in the form).
  const acc = await accessSettings()
  const t = String(getQuery(event).invite ?? '')
  const inv = t ? await inviteFor(t) : null
  return { plans: r.rows, mode: acc.mode, invite: inv ? { name: inv.name, email: inv.email, company: inv.company, country: inv.country } : t ? false : null }
})
