// Four key points on retention or on the customer base (kind=retention|customers).
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const q = getQuery(event)
  return await analyseCustomers(q.kind === 'customers' ? 'customers' : 'retention', q.refresh === '1')
})
