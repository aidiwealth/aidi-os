// A shared financial board (read-only). No sign-in; the link is private to whoever has it.
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) throw apiError('not_found', 'This link is not valid.', 404)
  const b = (await asPlatform(() => db().query<{ id: string; organization_id: string; name: string; note: string | null; kpis: string[]; charts: BoardChart[]; period: string; count: number; share_enabled: boolean; expired: boolean; forecast_id: string | null }>(
    'SELECT id, organization_id, name, note, kpis, charts, period, count, share_enabled, forecast_id, (share_expires IS NOT NULL AND share_expires < now()) AS expired FROM financials.boards WHERE share_token = $1', [token]))).rows[0]
  if (!b || !b.share_enabled) throw apiError('not_found', 'This link is not valid.', 404)
  if (b.expired) throw apiError('expired', 'This link has expired. Ask the company for a new one.', 410)
  setOrgContext(b.organization_id)
  // A switch of company or period is the same visit: only the first load counts as a view.
  if (!getQuery(event).period && !getQuery(event).subject) await asPlatform(() => db().query('UPDATE financials.boards SET views = views + 1, last_viewed_at = now() WHERE id = $1', [b.id]))
  const fc = b.forecast_id ? (await db().query<{ name: string; assumptions: unknown }>('SELECT name, assumptions FROM financials.forecasts WHERE id = $1', [b.forecast_id]).catch(() => ({ rows: [] }))).rows[0] ?? null : null
  // The viewer can look at the group or any one company in it, and by month, quarter or year (the board's own
  // choices are the starting point). Only the companies the company's plan shows are offered.
  const q = getQuery(event)
  const period = ['month', 'quarter', 'year'].includes(String(q.period)) ? String(q.period) : b.period
  const count = period === b.period ? b.count : period === 'quarter' ? Math.max(4, Math.ceil(b.count / (b.period === 'month' ? 3 : 1))) : period === 'year' ? Math.max(3, Math.ceil(b.count / (b.period === 'month' ? 12 : b.period === 'quarter' ? 4 : 1))) : Math.max(12, b.count * (b.period === 'quarter' ? 3 : 12))
  const ents = (await currentOrg())?.kind === 'company' ? await custEntities().catch(() => []) : []
  const choices = ents.length > 1 ? [{ id: 'group', name: (await groupName().catch(() => 'Group')) + ' (group)' }, ...ents.map((e) => ({ id: 'entity:' + e.id, name: e.name }))] : []
  const asked = String(q.subject ?? '')
  const subject = choices.some((c) => c.id === asked) ? asked : null
  return { forecast: fc, name: b.name, note: b.note, period, base_period: b.period, entities: choices, subject: subject ?? (choices.length ? 'group' : null), data: await boardData(b.kpis, b.charts, period, count, subject), workspace: await publicWorkspace(), branding: await brandingOf(b.organization_id).catch(() => null) }
})
