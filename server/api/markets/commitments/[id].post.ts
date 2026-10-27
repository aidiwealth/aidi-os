// A pre-IPO commitment: approve (fresh code, every check passing), mark the documents signed or the money wired,
// confirm the units from the SPV statement (writes the holding and, for a company account, the journal), or stop it.
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const id = String(getRouterParam(event, 'id') ?? '')
  if (!/^[0-9a-f-]{36}$/.test(id)) throw apiError('not_found', 'Not found.', 404)
  const b = await readBody<{ action?: string; code?: string; units?: number; price?: number; fees?: number; date?: string; note?: string }>(event)
  await commitmentAct(id, user.userId, { action: String(b?.action ?? ''), code: b?.code, units: b?.units, price: b?.price, fees: b?.fees, date: b?.date, note: b?.note })
  await audit({ event, actorUserId: user.userId, action: 'markets.commitment_' + String(b?.action ?? ''), objectType: 'market_commitment', objectId: id })
  return { ok: true }
})
