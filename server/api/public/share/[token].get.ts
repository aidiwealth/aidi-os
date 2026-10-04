// A shared financials page: only the chosen metrics, read-only. Each view is counted and the sharer is told (hourly at most).
export default defineEventHandler(async (event) => {
  const token = String(getRouterParam(event, 'token') ?? '')
  if (token.length < 30) throw apiError('invalid_link', 'This link is not valid.', 404)
  const r = await asPlatform(() => db().query<{ id: string; organization_id: string; title: string; subject: string; currency: string; period_type: string; metrics: string[]; expired: boolean; notify: boolean; sharer: string | null }>(
    `SELECT s.id, s.organization_id, s.title, s.subject, s.currency, s.period_type, s.metrics, (s.expires_at < now()) AS expired,
            (s.last_viewed_at IS NULL OR s.last_viewed_at < now() - interval '1 hour') AS notify, u.email AS sharer
       FROM financials.shares s LEFT JOIN core.users u ON u.id = s.created_by WHERE s.token_hash = $1`, [sha256(token)]))
  const s = r.rows[0]
  if (!s) throw apiError('invalid_link', 'This link is not valid.', 404)
  if (s.expired) throw apiError('expired', 'This link has expired. Ask the sender for a new one.', 410)
  setOrgContext(s.organization_id)
  if (!(await enabledModules()).has('financials')) throw apiError('invalid_link', 'This link is not valid.', 404)
  await db().query('UPDATE financials.shares SET views = views + 1, last_viewed_at = now() WHERE id = $1', [s.id])
  if (s.notify && s.sharer) sendShareViewedEmail(s.sharer, s.title, (await appUrl()) + '/financials').catch((e) => console.error('[financials] view alert failed', e))
  const rows = (await loadStatements(s.subject, s.period_type, s.currency)).slice(-12)
  const series = s.metrics.map((m) => ({ key: m, points: rows.map((x) => {
    const d = derive(x.lines, x.period_type); const v = m.startsWith('kpi:') ? x.kpis[m.slice(4)] ?? null : d[m] ?? null
    return { period: x.period_end, value: v } }) }))
  return { title: s.title, subject: await subjectName(s.subject), currency: rows[0]?.currency ?? s.currency, period_type: s.period_type, series, lines: LINES, derived: DERIVED, workspace: await publicWorkspace() }
})
