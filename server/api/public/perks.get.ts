// Public list of Finvry perks (app.finvry.com/rewards): who offers what, never the codes or how to redeem.
export default defineEventHandler(async (event) => {
  if (hostBrand(event) !== 'finvry') throw apiError('not_found', 'Not found', 404)
  setHeader(event, 'cache-control', 'public, max-age=300')
  setResponseHeader(event, 'Access-Control-Allow-Origin', '*') // finvry.com lists these on its Founders page
  const rows = (await asPlatform(() => db().query<PerkRow>('SELECT ' + PERK_COLS + ' FROM core.perks WHERE public AND ' + LIVE + ' ORDER BY featured DESC, sort, partner'))).rows
  return { categories: PERK_CATEGORIES, perks: rows.map((p) => ({ id: p.id, partner: p.partner, logo_url: p.logo_url, website: p.website, category: p.category, headline: p.headline, summary: p.summary, value_usd: p.value_usd, audience: p.audience, featured: p.featured })) }
})
