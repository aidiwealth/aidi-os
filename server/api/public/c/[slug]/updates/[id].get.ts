// A published update on a company's public investor page.
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '').toLowerCase(), id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) || !/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const p = (await asPlatform(() => db().query<{ organization_id: string; published: boolean }>('SELECT organization_id, published FROM financials.public_pages WHERE slug = $1', [slug]))).rows[0]
  if (!p?.published) throw apiError('not_found', 'Not found', 404)
  setOrgContext(p.organization_id)
  return publicUpdate(id, true)
})
