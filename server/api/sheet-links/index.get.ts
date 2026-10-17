// Linked sheets for this workspace (optionally only those feeding Financials or forecasts).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const t = String(getQuery(event).target ?? '')
  const on = await enabledModules(), targets = ['financials', 'forecast'].filter((t) => on.has(t))
  const r = await db().query(`SELECT l.id, l.name, l.url, l.target, l.subject, l.forecast_id, f.name AS forecast, l.currency, l.sheet, l.mapping, l.auto, l.mode, l.ai_map, l.show_source,
      l.last_synced_at, l.last_error, l.last_result, to_char(l.created_at, 'YYYY-MM-DD') AS created
    FROM financials.sheet_links l LEFT JOIN financials.forecasts f ON f.id = l.forecast_id WHERE ($1 = '' OR l.target = $1) AND l.target = ANY($2::text[]) ORDER BY l.created_at`, [t === 'financials' || t === 'forecast' ? t : '', targets])
  return { links: r.rows }
})
