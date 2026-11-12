// The company's investor page settings (a draft is suggested if none exists yet).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const org = (await currentOrg())!
  const r = await db().query('SELECT slug, published, headline, about, website, deck_url, contact_email, metrics, period_type, views, last_viewed_at, logo_id, cover_id, board_id, deck_id, room_link_id, forecast_id, forecast_group, email_gate, captable_id, captable_detail, show_sectors FROM financials.public_pages LIMIT 1')
  const slug = org.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || org.slug
  // Each part on its own, all at once rather than one after another.
  const [room, cash_sec, visitors, ents, metrics, me] = await Promise.all([
    (async () => { const on = await enabledModules(); if (!on.has('fundraising')) return { available: false }
      const files = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM fundraise.files')).rows[0]?.n ?? 0)
      const lid = (r.rows[0] as { room_link_id?: string | null } | undefined)?.room_link_id
      const l = lid ? (await db().query<{ views: number; revoked: boolean }>('SELECT views, revoked FROM fundraise.links WHERE id = $1', [lid])).rows[0] : undefined
      return { available: true, files, on: !!l && !l.revoked, views: l?.views ?? 0 } })(),
    (async () => ({ has: !!(await db().query("SELECT 1 FROM financials.statements WHERE coalesce((lines->>'investments')::numeric, 0) <> 0 LIMIT 1").catch(() => ({ rowCount: 0 }))).rowCount, on: await investorCashPolicy() }))(),
    (async () => { const v = await db().query<{ email: string; name: string | null; created_at: string; last_viewed_at: string; views: number }>('SELECT email, name, created_at, last_viewed_at, views FROM financials.page_access ORDER BY last_viewed_at DESC LIMIT 50').catch(() => ({ rows: [] })); const n = (await db().query<{ n: number }>('SELECT count(*)::int AS n FROM financials.page_access').catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n ?? 0; return { total: n, recent: v.rows } })(),
    custEntities().catch(() => []),
    metricCatalog(),
    currentOrg()])
  return { page: r.rows[0] ?? { slug, published: false, headline: '', about: '', website: '', deck_url: '', contact_email: '', metrics: ['revenue', 'gross_margin', 'net_income', 'cash'], period_type: 'month', views: 0, last_viewed_at: null },
    room, cash_sec, visitors, group_forecast: ents.length > 1,
    exists: !!r.rows[0], base: (me?.kind === 'company' ? brands().finvry.url : brands().aidi.url) + '/c/', metrics: metrics.map((m) => ({ key: m.key, label: m.label, group: m.group })), company: org.name }
})
