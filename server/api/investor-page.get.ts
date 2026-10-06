// The company's investor page settings (a draft is suggested if none exists yet).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const r = await db().query('SELECT slug, published, headline, about, website, deck_url, contact_email, metrics, period_type, views, last_viewed_at, logo_id, cover_id, board_id, deck_id, room_link_id FROM financials.public_pages LIMIT 1')
  const slug = org.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || org.slug
  return { page: r.rows[0] ?? { slug, published: false, headline: '', about: '', website: '', deck_url: '', contact_email: '', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period_type: 'month', views: 0, last_viewed_at: null },
    room: await (async () => { const on = await enabledModules(); if (!on.has('fundraising')) return { available: false }
      const files = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM fundraise.files')).rows[0]?.n ?? 0)
      const lid = (r.rows[0] as { room_link_id?: string | null } | undefined)?.room_link_id
      const l = lid ? (await db().query<{ views: number; revoked: boolean }>('SELECT views, revoked FROM fundraise.links WHERE id = $1', [lid])).rows[0] : undefined
      return { available: true, files, on: !!l && !l.revoked, views: l?.views ?? 0 } })(),
    exists: !!r.rows[0], base: ((await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/c/', metrics: Object.entries(METRIC_LABEL).map(([key, label]) => ({ key, label })), company: org.name }
})
