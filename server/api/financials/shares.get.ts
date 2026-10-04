export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team', 'family')
  const r = await db().query("SELECT id, title, subject, metrics, views, last_viewed_at, to_char(expires_at, 'YYYY-MM-DD') AS expires, (expires_at < now()) AS expired, created_at FROM financials.shares ORDER BY created_at DESC")
  return r.rows
})
