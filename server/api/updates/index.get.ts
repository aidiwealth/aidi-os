export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const r = await db().query(`SELECT u.id, u.title, u.period_type, to_char(u.period_end, 'YYYY-MM-DD') AS period_end, u.status, u.published_at, u.updated_at, u.created_at, u.sent_at, u.sent_count, u.sent_to, u.from_name, u.pinned, u.is_template,
      (SELECT count(*)::int FROM financials.update_sends s WHERE s.update_id = u.id AND s.opened_at IS NOT NULL) AS opened
    FROM financials.updates u ORDER BY u.pinned DESC, coalesce(u.sent_at, u.created_at) DESC`)
  return r.rows
})
