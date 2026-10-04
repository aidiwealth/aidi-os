// The services Aidi offers, with prices, and the company's companies to order for.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  const items = await db().query("SELECT code, name, description, price::float AS price, currency, billing FROM services.catalog WHERE active ORDER BY sort, name")
  const companies = await db().query('SELECT id, name FROM services.companies WHERE client_id = $1 ORDER BY name', [u.clientId])
  return { items: items.rows, companies: companies.rows }
})
