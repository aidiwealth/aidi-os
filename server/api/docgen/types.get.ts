export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp', 'team')
  return Object.entries(DOC_TYPES).map(([key, t]) => ({ key, ...t }))
})
