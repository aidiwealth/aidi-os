// Create, change or delete a marketing process (funnel stages and channels).
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  return saveProcess(event, 'marketing', user.userId, await readBody(event))
})
