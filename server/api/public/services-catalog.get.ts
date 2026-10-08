// Public price list for finvry.com: active services the Services desk marks "Show on finvry.com", with the
// provider/government cost and the Finvry processing fee. Read-only; cached for 5 minutes.
export default defineEventHandler(async (event) => {
  if (handleCors(event, { origin: ['https://finvry.com', 'https://www.finvry.com', 'http://localhost:8080'], methods: ['GET', 'OPTIONS'] })) return
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  const op = (await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE (settings->>'services_operator') = 'true' ORDER BY created_at LIMIT 1"))).rows[0]?.id
  if (!op) return []
  setOrgContext(op)
  return (await db().query("SELECT name, code, billing, region, currency, cost::float, fee::float, price::float, cost_ngn::float, fee_ngn::float, price_ngn::float, cost_label FROM services.catalog WHERE active AND public ORDER BY sort, name")).rows
})
