export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return (await db().query(`SELECT i.id, i.name, i.email, i.firm, (SELECT count(*)::int FROM financials.update_sends s WHERE s.investor_id = i.id) AS sent,
    (SELECT count(*)::int FROM financials.update_sends s WHERE s.investor_id = i.id AND s.opened_at IS NOT NULL) AS opened FROM financials.investors i ORDER BY i.name`)).rows
})
