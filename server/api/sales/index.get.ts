// Sales: the company's processes, the chosen one's deals and what they add up to (conversion, win rate, cycle time,
// weighted pipeline, expected wins by month, and what the monthly target needs).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  return salesView(typeof getQuery(event).p === 'string' ? String(getQuery(event).p) : undefined)
})
