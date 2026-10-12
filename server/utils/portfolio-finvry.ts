// A portfolio company that is also a Finvry workspace. When it sends (or publishes) an investor update, the team that
// holds it in Aidi OS is told and can import that update's figures (from the company's Financials for the update's
// months) and text into the portfolio. Only updates the company has already sent to investors are read.
import type { Block } from './update-render'
interface SentUpdate { id: string; title: string; period_type: string; period_end: string; sent_at: string | null }

async function inOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const prev = currentOrgId(); setOrgContext(orgId)
  try { return await fn() } finally { setOrgContext(prev) }
}

export async function finvryWorkspaces(q: string): Promise<{ id: string; name: string; updates: number; owner_name: string | null; owner_email: string | null }[]> {
  return (await asPlatform(() => db().query<{ id: string; name: string; updates: number; owner_name: string | null; owner_email: string | null }>(
    `SELECT o.id, o.name, (SELECT count(*)::int FROM financials.updates u WHERE u.organization_id = o.id AND (u.sent_at IS NOT NULL OR u.status = 'published')) AS updates, ow.name AS owner_name, ow.email AS owner_email
       FROM core.organizations o LEFT JOIN LATERAL (SELECT u.email, p.full_name AS name FROM core.memberships m JOIN core.users u ON u.id = m.user_id LEFT JOIN core.people p ON p.id = u.person_id WHERE m.organization_id = o.id AND m.status = 'active' ORDER BY m.created_at LIMIT 1) ow ON true WHERE o.kind = 'company' AND o.status <> 'closed' AND ($1 = '' OR o.name ILIKE '%' || $1 || '%') ORDER BY o.name LIMIT 20`, [q.trim().slice(0, 80)]))).rows
}

export async function sentUpdates(orgId: string): Promise<SentUpdate[]> {
  return (await asPlatform(() => db().query<SentUpdate>(
    `SELECT id, title, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, coalesce(sent_at, published_at) AS sent_at FROM financials.updates
      WHERE organization_id = $1 AND NOT coalesce(is_template, false) AND (sent_at IS NOT NULL OR status = 'published') ORDER BY coalesce(sent_at, published_at) DESC LIMIT 12`, [orgId]))).rows
}

const KPI: [RegExp, string][] = [[/customer|client|subscriber|paying/i, 'customers'], [/headcount|employee|staff|team size|fte/i, 'headcount']]
// The months an update covers (1 or 3), with the portfolio metrics for each, and the update's text.
export async function updateFigures(orgId: string, updateId: string): Promise<{ title: string; months: { period: string; values: Record<string, number | null> }[]; text: string } | null> {
  const u = (await asPlatform(() => db().query<{ title: string; period_type: string; period_end: string; blocks: Block[] | null; body: string | null; highlights: string | null }>(
    "SELECT title, period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end, blocks, body, highlights FROM financials.updates WHERE id = $1 AND organization_id = $2 AND (sent_at IS NOT NULL OR status = 'published')", [updateId, orgId]))).rows[0]
  if (!u) return null
  const rows = await inOrg(orgId, async () => { const ent = await companyEntityId(); return ent ? loadStatements('entity:' + ent, 'month', 'USD') : [] })
  const n = u.period_type === 'quarter' ? 3 : 1
  const end = u.period_end.slice(0, 7)
  const start = new Date(end + '-01T00:00:00Z'); start.setUTCMonth(start.getUTCMonth() - (n - 1))
  const from = start.toISOString().slice(0, 7)
  const months = rows.filter((r) => r.period_end.slice(0, 7) >= from && r.period_end.slice(0, 7) <= end).map((r) => {
    const d = derive(r.lines, 'month'), num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const values: Record<string, number | null> = { revenue: num(r.lines.revenue), gross_margin: d.gross_margin ?? null, net_burn: d.burn ?? null, cash: num(r.lines.cash), customers: null, headcount: null }
    for (const [k, v] of Object.entries(r.kpis ?? {})) for (const [re, key] of KPI) if (re.test(k) && values[key] === null) values[key] = num(v)
    return { period: r.period_end.slice(0, 7) + '-01', values }
  })
  const text = (u.blocks?.length ? blocksText(u.blocks) : [u.highlights, u.body].filter(Boolean).join('\n\n')).slice(0, 4000)
  return { title: u.title, months, text }
}

// Import an update into a portfolio company (in the current Aidi OS workspace). Team overrides are kept.
export async function importFinvryUpdate(companyId: string, updateId: string, userId: string): Promise<{ months: number; values: number }> {
  const c = (await db().query<{ finvry_org_id: string | null }>('SELECT finvry_org_id FROM portfolio.companies WHERE id = $1', [companyId])).rows[0]
  if (!c?.finvry_org_id) throw apiError('not_linked', 'Link this company to its Finvry workspace first.')
  const f = await updateFigures(c.finvry_org_id, updateId)
  if (!f) throw apiError('not_found', 'That update was not found or has not been sent.', 404)
  let values = 0
  for (const m of f.months) for (const [metric, v] of Object.entries(m.values)) {
    if (v === null) continue
    await db().query('INSERT INTO portfolio.metric_values (company_id, period, metric, founder_value) VALUES ($1,$2,$3,$4) ON CONFLICT (company_id, period, metric) DO UPDATE SET founder_value = EXCLUDED.founder_value, updated_at = now()', [companyId, m.period, metric, v])
    values++
  }
  const last = f.months[f.months.length - 1]?.period
  if (f.text && last) await db().query("INSERT INTO portfolio.updates (company_id, period, highlights) VALUES ($1,$2,$3) ON CONFLICT (company_id, period) DO UPDATE SET highlights = CASE WHEN portfolio.updates.highlights IS NULL OR portfolio.updates.highlights LIKE 'From Finvry update:%' THEN EXCLUDED.highlights ELSE portfolio.updates.highlights END, submitted_at = now()", [companyId, last, ('From Finvry update: ' + f.title + '\n\n' + f.text).slice(0, 4000)])
  await db().query('INSERT INTO portfolio.finvry_imports (company_id, update_id, months, imported_by) VALUES ($1,$2,$3,$4) ON CONFLICT (company_id, update_id) DO UPDATE SET months = EXCLUDED.months, imported_by = EXCLUDED.imported_by, imported_at = now()', [companyId, updateId, f.months.length, userId])
  await db().query('UPDATE portfolio.companies SET finvry_new_update = NULL WHERE id = $1 AND finvry_new_update = $2', [companyId, updateId])
  return { months: f.months.length, values }
}

// Called when a Finvry workspace sends or publishes an update: flag it on linked portfolio companies and email the
// holding team. Never tells the Finvry company anything about who holds it.
export async function notifyPortfolioOfUpdate(orgId: string, updateId: string, title: string, company: string): Promise<void> {
  const links = (await asPlatform(() => db().query<{ id: string; organization_id: string; name: string }>('UPDATE portfolio.companies SET finvry_new_update = $2 WHERE finvry_org_id = $1 AND active RETURNING id, organization_id, name', [orgId, updateId]))).rows
  const base = brands().aidi.url
  for (const l of links) {
    try {
      const to = await inOrg(l.organization_id, () => orgNotifyEmails())
      for (const e of to) await sendPortfolioUpdateNotice(e, l.name || company, title, base + '/portfolio/' + l.id)
    } catch (err) { console.error('[portfolio] update notice failed', err) }
  }
}
