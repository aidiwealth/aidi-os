// Marketing: the company's processes, the chosen one's channels by month (typed, or brought in from Banking
// and won deals), campaigns, and the funnel, cost per lead, CAC and return by channel.
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  if ((await currentOrg())?.kind !== 'company') throw apiError('not_found', 'Not found', 404)
  const q = getQuery(event)
  const sc = await forecastScope(event)
  return { ...(await marketingView(typeof q.p === 'string' ? q.p : undefined, Math.min(13, Math.max(3, Number(q.months) || 7)), sc)), scope: { group: sc.group, entity: sc.entity, currency: sc.currency } }
})
