// The workspace's boards with their figures.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  await ensureBoards()
  const rows = (await db().query<{ id: string; audience: string; name: string; kpis: string[]; charts: BoardChart[]; period: string; count: number; note: string | null; share_token: string | null; share_enabled: boolean; share_expires: string | null; views: number; last_viewed_at: string | null; forecast_id: string | null }>(
    'SELECT id, audience, name, kpis, charts, period, count, note, share_token, share_enabled, share_expires, views, last_viewed_at, forecast_id FROM financials.boards ORDER BY sort, created_at')).rows
  const isCo = (await currentOrg())?.kind === 'company', base = isCo ? brands().finvry.url : brands().aidi.url
  // A company with subsidiaries: the figures of the company (or the group) chosen at the top, like Financials.
  const sc = isCo ? await forecastScope(event).catch(() => null) : null, subject = sc ? (sc.group ? 'group' : sc.entity ? 'entity:' + sc.entity : null) : null
  const fcOn = (await enabledModules()).has('forecast')
  const forecasts = fcOn ? (await db().query<{ id: string; name: string; assumptions: unknown }>("SELECT f.id, CASE WHEN (SELECT count(*) FROM core.entities x WHERE x.kind = 'operating') > 1 AND e.name IS NOT NULL THEN e.name || ': ' || f.name ELSE f.name END AS name, f.assumptions FROM financials.forecasts f LEFT JOIN core.entities e ON e.id = f.entity_id ORDER BY f.updated_at DESC")).rows : []
  const out = []
  for (const b of rows) { const f = forecasts.find((x) => x.id === b.forecast_id); out.push({ ...b, share_url: b.share_token ? base + '/b/' + b.share_token : null, data: await boardData(b.kpis, b.charts, b.period, b.count, subject), forecast: f ? { id: f.id, name: f.name, assumptions: f.assumptions } : null }) }
  // Customer and KPI metrics are offered alongside the standard ones.
  const extra = Object.fromEntries((await metricCatalog()).filter((m) => !(m.key in BOARD_METRICS) && m.group !== 'Financials').map((m) => [m.key, { label: m.label, unit: m.unit }]))
  return { boards: out, metrics: { ...BOARD_METRICS, ...extra }, forecasts: forecasts.map((f) => ({ id: f.id, name: f.name })) }
})
