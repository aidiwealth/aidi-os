// Desk: the founder's Fundraising pipelines, to place an investor the team adds.
export default defineEventHandler(async (event) => {
  await requireOperator(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found', 404)
  return await founderPipelines(id)
})
