// The services this client can order, priced for them (naira for Nigerian clients), and their companies — the same
// list the client sees in Finvry, for ordering on their behalf.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'team', 'gp')
  const cid = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  if (!cid.success) throw apiError('invalid', 'Invalid request.')
  const ng = await clientIsNigerian(cid.data)
  const raw = await db().query<{ code: string; name: string; description: string | null; price: number | null; price_ngn: number | null; currency: string; billing: string; region: string }>("SELECT code, name, description, price::float AS price, price_ngn::float AS price_ngn, currency, billing, region FROM services.catalog WHERE active ORDER BY sort, name")
  const items = raw.rows.filter((i) => i.region !== 'ng' || ng).map((i) => ({ code: i.code, name: i.name, description: i.description, billing: i.billing, ...priceFor(i, ng), ...(i.code === 'virtual_office' ? { alt: { us: priceFor(i, false), ng: priceFor(i, true) } } : {}) }))
  const companies = await db().query('SELECT id, name, entity_type, jurisdiction AS state, country, status FROM services.companies WHERE client_id = $1 ORDER BY name', [cid.data])
  return { items, companies: companies.rows, wallet: await clientWallet(cid.data) }
})
