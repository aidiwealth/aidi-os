// Create (from a template), change or delete a sales process.
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  return saveProcess(event, 'sales', user.userId, await readBody(event))
})
