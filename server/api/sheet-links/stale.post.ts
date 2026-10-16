// Keeps linked sheets current while people use the app: when Financials or Forecast opens, links not read in the
// last hour are read again (a few at a time). The daily job covers the rest.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const t = String(getQuery(event).target ?? '')
  const links = (await db().query<LinkRow>(`SELECT ${LINK_COLS} FROM financials.sheet_links WHERE auto AND ($1 = '' OR target = $1) AND (last_synced_at IS NULL OR last_synced_at < now() - interval '1 hour') ORDER BY last_synced_at NULLS FIRST LIMIT 3`, [t === 'financials' || t === 'forecast' ? t : ''])).rows
  let synced = 0
  for (const l of links) { try { await syncLink(l, user.userId); synced++ } catch (e) { console.error('[sheet-links] stale sync', l.id, (e as Error).message) } }
  return { synced }
})
