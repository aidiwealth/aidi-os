// Public price list for finvry.com: active services the Services desk marks "Show on finvry.com". All-in prices only.
// ?country=NG returns naira prices (and Nigeria-only services); every other country sees US-dollar prices. Cached 5 minutes.
export default defineEventHandler(async (event) => {
  if (handleCors(event, { origin: ['https://finvry.com', 'https://www.finvry.com', 'http://localhost:8080'], methods: ['GET', 'OPTIONS'] })) return
  setResponseHeader(event, 'cache-control', 'public, max-age=300')
  const ng = String(getQuery(event).country ?? '').toUpperCase() === 'NG'
  const op = (await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE (settings->>'services_operator') = 'true' ORDER BY created_at LIMIT 1"))).rows[0]?.id
  if (!op) return []
  setOrgContext(op)
  const rows = (await db().query<{ name: string; code: string; billing: string; region: string; price: number | null; price_ngn: number | null; currency: string }>(
    "SELECT name, code, billing, region, price::float, price_ngn::float, currency FROM services.catalog WHERE active AND public AND (region <> 'ng' OR $1) AND (price IS NOT NULL OR price_ngn IS NOT NULL OR billing = 'quoted') ORDER BY sort, name", [ng])).rows
  return rows.map((r) => { const p = priceFor(r, ng); return { name: r.name, code: r.code, billing: r.billing, region: r.region, price: p.price, currency: p.currency } })
    .filter((r) => r.price != null || r.billing === 'quoted')
})
