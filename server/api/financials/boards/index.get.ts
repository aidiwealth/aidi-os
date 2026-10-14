// The workspace's boards with their figures.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  await ensureBoards()
  const rows = (await db().query<{ id: string; audience: string; name: string; kpis: string[]; charts: BoardChart[]; period: string; count: number; note: string | null; share_token: string | null; share_enabled: boolean; share_expires: string | null; views: number; last_viewed_at: string | null; forecast_id: string | null }>(
    'SELECT id, audience, name, kpis, charts, period, count, note, share_token, share_enabled, share_expires, views, last_viewed_at, forecast_id FROM financials.boards ORDER BY sort, created_at')).rows
  const base = (await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url
  const fcOn = (await enabledModules()).has('forecast')
  const forecasts = fcOn ? (await db().query<{ id: string; name: string; assumptions: unknown }>('SELECT id, name, assumptions FROM financials.forecasts ORDER BY updated_at DESC')).rows : []
  const out = []
  for (const b of rows) { const f = forecasts.find((x) => x.id === b.forecast_id); out.push({ ...b, share_url: b.share_token ? base + '/b/' + b.share_token : null, data: await boardData(b.kpis, b.charts, b.period, b.count), forecast: f ? { id: f.id, name: f.name, assumptions: f.assumptions } : null }) }
  return { boards: out, metrics: BOARD_METRICS, forecasts: forecasts.map((f) => ({ id: f.id, name: f.name })) }
})
