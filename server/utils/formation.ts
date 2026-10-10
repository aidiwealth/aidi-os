// Formation sign-up: packages and add-ons come from the catalogue (state fees included in the package price).
export const FORMATION_STATES = ['Delaware', 'Wyoming', 'Florida', 'Texas', 'California', 'New York', 'Nevada', 'Other']
export interface FItem { code: string; name: string; description: string | null; billing: string; price: string; currency: string }
// Prices and offers come straight from Prices & settings, with the same rules as "Start a company" in Finvry:
// the registered agent is free for the first year then renews yearly; a virtual office is monthly or yearly.
export async function formationCatalog(): Promise<{ llc: FItem | null; inc: FItem | null; addons: FItem[]; agent: FItem | null; virtual: FItem | null }> {
  const r = await db().query<FItem & { formation: boolean }>("SELECT code, name, description, billing, price::text, currency, formation FROM services.catalog WHERE active AND price IS NOT NULL AND currency = 'USD' ORDER BY sort, name")
  const special = ['llc_formation', 'inc_formation', 'registered_agent', 'virtual_office']
  return { llc: r.rows.find((i) => i.code === 'llc_formation') ?? null, inc: r.rows.find((i) => i.code === 'inc_formation') ?? null,
    agent: r.rows.find((i) => i.code === 'registered_agent') ?? null, virtual: r.rows.find((i) => i.code === 'virtual_office') ?? null,
    addons: r.rows.filter((i) => i.formation && !special.includes(i.code)).map(({ formation: _f, ...i }) => i) }
}
export const addonQty = (i: { billing: string }) => (i.billing === 'monthly' ? 12 : 1)
export async function orgBySlug(slug: string): Promise<string> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw apiError('not_found', 'This page does not exist.', 404)
  const r = await asPlatform(() => db().query<{ id: string }>("SELECT id FROM core.organizations WHERE slug = $1 AND status = 'active'", [slug]))
  if (!r.rows[0]) throw apiError('not_found', 'This page does not exist.', 404)
  setOrgContext(r.rows[0].id)
  if (!(await enabledModules()).has('services')) throw apiError('not_found', 'This page does not exist.', 404)
  return r.rows[0].id
}
