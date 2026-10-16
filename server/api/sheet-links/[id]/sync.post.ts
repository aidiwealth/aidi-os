// Sync now: re-reads one linked sheet.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const l = (await db().query<LinkRow>(`SELECT ${LINK_COLS} FROM financials.sheet_links WHERE id = $1`, [getRouterParam(event, 'id')])).rows[0]
  if (!l) throw apiError('not_found', 'Not found', 404)
  await requireModule(event, l.target === 'forecast' ? 'forecast' : 'financials')
  rateLimit('sheet_sync', user.userId, 120, 60 * 60 * 1000)
  const r = await syncLink(l, user.userId)
  return { ok: true, ...r }
})
