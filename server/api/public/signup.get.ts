// The sign-up wizard and finvry.com pricing: company plans with naira and dollar prices.
export default defineEventHandler(async (event) => {
  if (handleCors(event, { origin: ['https://finvry.com', 'https://www.finvry.com', 'http://localhost:8080'], methods: ['GET', 'OPTIONS'] })) return
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  const r = await asPlatform(() => db().query("SELECT code, name, description, seat_limit, price_monthly_usd::float AS usd, price_monthly_ngn::float AS ngn, price_annual_usd::float AS usd_year, price_annual_ngn::float AS ngn_year FROM core.plans WHERE code LIKE 'company\\_%' AND public AND active ORDER BY sort"))
  return { plans: r.rows }
})
