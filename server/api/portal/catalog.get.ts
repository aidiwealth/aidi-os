// The services Aidi offers, with prices, and the company's companies to order for.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const ng = await clientIsNigerian(u.clientId)
  const raw = await db().query<{ code: string; name: string; description: string | null; price: number | null; price_ngn: number | null; currency: string; billing: string; region: string }>("SELECT code, name, description, price::float AS price, price_ngn::float AS price_ngn, currency, billing, region FROM services.catalog WHERE active ORDER BY sort, name")
  const items = { rows: raw.rows.filter((i) => i.region !== 'ng' || ng).map((i) => ({ code: i.code, name: i.name, description: i.description, billing: i.billing, ...priceFor(i, ng) })) }
  const companies = await db().query('SELECT id, name FROM services.companies WHERE client_id = $1 ORDER BY name', [u.clientId])
  return { items: items.rows, companies: companies.rows }
})
