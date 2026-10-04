// The sign-up wizard: company plans with naira and dollar prices.
export default defineEventHandler(async () => {
  const r = await asPlatform(() => db().query("SELECT code, name, description, seat_limit, price_monthly_usd::float AS usd, price_monthly_ngn::float AS ngn, price_annual_usd::float AS usd_year, price_annual_ngn::float AS ngn_year FROM core.plans WHERE code LIKE 'company\\_%' AND public AND active ORDER BY sort"))
  return { plans: r.rows }
})
