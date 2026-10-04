export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query(`SELECT u.id, u.title, u.period_type, to_char(u.period_end, 'YYYY-MM-DD') AS period_end, u.status, u.published_at, u.updated_at,
      (SELECT count(*)::int FROM financials.update_sends s WHERE s.update_id = u.id) AS sent, (SELECT count(*)::int FROM financials.update_sends s WHERE s.update_id = u.id AND s.opened_at IS NOT NULL) AS opened
    FROM financials.updates u ORDER BY u.period_end DESC, u.created_at DESC`)
  return r.rows
})
