// A published update on a company's public investor page.
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '').toLowerCase(), id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) || !/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const p = (await asPlatform(() => db().query<{ organization_id: string; published: boolean }>('SELECT organization_id, published FROM financials.public_pages WHERE slug = $1', [slug]))).rows[0]
  if (!p?.published) throw apiError('not_found', 'Not found', 404)
  setOrgContext(p.organization_id)
  const branding = await brandingOf(p.organization_id)
  if (ndaOn(branding, 'updates') && !(await ndaSigned(p.organization_id, getQuery(event).nda))) return { gated: true, nda: { required: true, text: branding.nda_text, key: branding.org_key }, branding, company: (await currentOrg())!.name, html: '', title: '', body: '', label: '', figures: { currency: 'USD', current: null, previous: null }, workspace: await publicWorkspace() }
  return { gated: false, branding, ...(await publicUpdate(id, true)) }
})
