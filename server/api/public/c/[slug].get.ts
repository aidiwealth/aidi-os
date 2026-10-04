// A company's public investor page: its story, chosen metrics with trends, deck and contact. Views are counted.
export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') ?? '').toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) throw apiError('not_found', 'This page does not exist.', 404)
  const r = await asPlatform(() => db().query<{ organization_id: string; published: boolean; headline: string | null; about: string | null; website: string | null; deck_url: string | null; contact_email: string | null; metrics: string[]; period_type: string; notify: boolean }>(
    `SELECT p.organization_id, p.published, p.headline, p.about, p.website, p.deck_url, p.contact_email, p.metrics, p.period_type, (p.last_viewed_at IS NULL OR p.last_viewed_at < now() - interval '6 hours') AS notify
       FROM financials.public_pages p JOIN core.organizations o ON o.id = p.organization_id AND o.status = ANY($2::text[]) WHERE p.slug = $1`, [slug, LIVE_ORG_STATUSES]))
  const p = r.rows[0]
  if (!p || !p.published) throw apiError('not_found', 'This page does not exist.', 404)
  setOrgContext(p.organization_id)
  const org = (await currentOrg())!
  const branding = await brandingOf(p.organization_id)
  if (ndaOn(branding, 'page') && !(await ndaSigned(p.organization_id, getQuery(event).nda))) return { gated: true, nda: { required: true, text: branding.nda_text, key: branding.org_key }, branding, company: org.name, headline: null, about: null, website: null, deck_url: null, contact_email: null, period_type: 'month', currency: 'USD', metrics: [], updates: [], workspace: await publicWorkspace() }
  const ent = await companyEntityId()
  const rows = ent ? (await loadStatements('entity:' + ent, p.period_type, (org.settings.currency as string) || 'USD')).slice(-12) : []
  const metrics = p.metrics.map((m) => ({ key: m, label: METRIC_LABEL[m] ?? m, points: rows.map((x) => ({ period: x.period_end, value: derive(x.lines, x.period_type)[m] ?? null })) }))
  await db().query('UPDATE financials.public_pages SET views = views + 1, last_viewed_at = now()')
  if (p.notify) { const to = await orgNotifyEmails(); for (const e of to) sendShareViewedEmail(e, org.name + ' investor page', brands().finvry.url + '/investor-page').catch(() => {}) }
  const updates = (await db().query("SELECT id, title, to_char(published_at, 'YYYY-MM-DD') AS published_at FROM financials.updates WHERE status = 'published' ORDER BY period_end DESC LIMIT 12")).rows
  return { gated: false, branding, updates, company: org.name, headline: p.headline, about: p.about, website: p.website, deck_url: p.deck_url, contact_email: p.contact_email, period_type: p.period_type,
    currency: rows[rows.length - 1]?.currency ?? ((org.settings.currency as string) || 'USD'), metrics, workspace: await publicWorkspace() }
})
