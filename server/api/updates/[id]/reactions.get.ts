// Founder: reactions and notes on an update.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  const reactions = (await db().query("SELECT r.emoji, i.name, i.email, r.created_at FROM financials.update_reactions r JOIN financials.update_sends s ON s.id = r.send_id JOIN financials.investors i ON i.id = s.investor_id WHERE r.update_id = $1 ORDER BY r.created_at DESC", [id])).rows
  const notes = (await db().query("SELECT n.body, i.name, i.email, n.created_at FROM financials.update_notes n JOIN financials.update_sends s ON s.id = n.send_id JOIN financials.investors i ON i.id = s.investor_id WHERE n.update_id = $1 ORDER BY n.created_at DESC", [id])).rows
  return { reactions, notes }
})
