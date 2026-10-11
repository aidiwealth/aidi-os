// A founder orders services: a job on the services desk, and an invoice for anything with a listed price (paid online
// or by transfer). Quoted services are priced by the team and invoiced after.
export default defineEventHandler(async (event) => {
  const u = await requirePortal(event)
  rateLimit('portal_order', u.userId ?? u.clientId, 10, 60 * 60 * 1000)
  const b = OrderBody.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose at least one service.')
  return { ok: true, ...(await placeServiceOrder(u.clientId, { name: u.name, email: u.email }, b.data)) }
})
