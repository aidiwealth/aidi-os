// Wealth client: their published statements.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'wealth_client')
  const id = await wmClientOfUser(user.userId)
  if (!id) return []
  return (await db().query("SELECT id, period_kind, to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end, data->'period'->>'label' AS label, (data->'summary'->>'ending')::float AS ending, published_at FROM wm.statements WHERE client_id = $1 ORDER BY period_end DESC", [id])).rows
})
