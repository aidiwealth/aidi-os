export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  const v = /^[0-9a-f-]{36}$/.test(id) ? await raiseView(id, false) : null
  if (!v) throw apiError('not_found', 'Not found', 404)
  return { ...v, labels: RAISE_STATUS }
})
