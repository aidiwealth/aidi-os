// A shared financial board (read-only): everything the board shows in the app (headline figures, charts, the forecast,
// the financial statements and its reports). No sign-in; an invite-only board first asks the visitor to confirm an
// invited email.
export default defineEventHandler(async (event) => {
  const b = await boardByToken(event)
  const access = await boardAccess(event, b)
  if (!access.ok) return { gated: true, name: b.name, workspace: await publicWorkspace(), branding: await brandingOf(b.organization_id).catch(() => null) }
  // A switch of company or period is the same visit: only the first load counts as a view.
  if (!getQuery(event).period && !getQuery(event).subject) await asPlatform(() => db().query('UPDATE financials.boards SET views = views + 1, last_viewed_at = now() WHERE id = $1 AND organization_id = $2', [b.id, b.organization_id]))
  const fc = b.forecast_id ? (await db().query<{ id: string; name: string; entity_id: string | null; assumptions: unknown }>('SELECT id, name, entity_id, assumptions FROM financials.forecasts WHERE id = $1', [b.forecast_id]).catch(() => ({ rows: [] }))).rows[0] ?? null : null
  // The viewer can look at the group or any one company in it, and by month, quarter or year (the board's own
  // choices are the starting point). Only the companies the company's plan shows are offered.
  const q = getQuery(event)
  const period = ['month', 'quarter', 'year'].includes(String(q.period)) ? String(q.period) : b.period
  const count = period === b.period ? b.count : period === 'quarter' ? Math.max(4, Math.ceil(b.count / (b.period === 'month' ? 3 : 1))) : period === 'year' ? Math.max(3, Math.ceil(b.count / (b.period === 'month' ? 12 : b.period === 'quarter' ? 4 : 1))) : Math.max(12, b.count * (b.period === 'quarter' ? 3 : 12))
  const isCo = (await currentOrg())?.kind === 'company'
  const ents = isCo ? await custEntities().catch(() => []) : []
  const choices = ents.length > 1 ? [{ id: 'group', name: (await groupName().catch(() => 'Group')) + ' (group)' }, ...ents.map((e) => ({ id: 'entity:' + e.id, name: e.name }))] : []
  const asked = String(q.subject ?? '')
  const subject = choices.some((c) => c.id === asked) ? asked : null
  const shown = fc || b.sections?.forecast ? await boardForecast(subject ?? (choices.length ? 'group' : null), fc).catch(() => null) : null
  // The subject the statements use (as on the board in the app).
  const fsubject = subject ?? (choices.length ? 'group' : isCo ? await companyEntityId().then((id) => (id ? 'entity:' + id : 'group')).catch(() => 'group') : 'group')
  const data = await boardData(b.kpis, b.charts, period, count, subject, fc)
  return { gated: false, forecast: shown ? { name: shown.name, group: shown.group, assumptions: shown.assumptions, pack: shown.pack, full: !!b.sections?.forecast } : null, name: b.name, note: b.note, period, base_period: b.period,
    entities: choices, subject: subject ?? (choices.length ? 'group' : null), statements: b.sections?.statements ? { subject: fsubject, currency: data.currency } : null,
    reports: await boardReports(b.documents), viewer: access.email, data, workspace: await publicWorkspace(), branding: await brandingOf(b.organization_id).catch(() => null) }
})
