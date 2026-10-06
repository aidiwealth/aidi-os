// The workspace's boards with their figures.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team', 'family')
  await ensureBoards()
  const rows = (await db().query<{ id: string; audience: string; name: string; kpis: string[]; charts: BoardChart[]; period: string; count: number; note: string | null; share_token: string | null; share_enabled: boolean; share_expires: string | null; views: number; last_viewed_at: string | null }>(
    'SELECT id, audience, name, kpis, charts, period, count, note, share_token, share_enabled, share_expires, views, last_viewed_at FROM financials.boards ORDER BY sort, created_at')).rows
  const base = (await currentOrg())?.kind === 'company' ? brands().finvry.url : brands().aidi.url
  const out = []
  for (const b of rows) out.push({ ...b, share_url: b.share_token ? base + '/b/' + b.share_token : null, data: await boardData(b.kpis, b.charts, b.period, b.count) })
  return { boards: out, metrics: BOARD_METRICS }
})
