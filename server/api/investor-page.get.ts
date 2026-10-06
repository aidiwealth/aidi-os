// The company's investor page settings (a draft is suggested if none exists yet).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const r = await db().query('SELECT slug, published, headline, about, website, deck_url, contact_email, metrics, period_type, views, last_viewed_at, logo_id, cover_id, board_id, deck_id FROM financials.public_pages LIMIT 1')
  const slug = org.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || org.slug
  return { page: r.rows[0] ?? { slug, published: false, headline: '', about: '', website: '', deck_url: '', contact_email: '', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period_type: 'month', views: 0, last_viewed_at: null },
    exists: !!r.rows[0], base: ((await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/c/', metrics: Object.entries(METRIC_LABEL).map(([key, label]) => ({ key, label })), company: org.name }
})
