// The team's own drivers for a stock (overriding the AI's): saved as a new valuation version (the earlier ones stay), with who and why, and
// kept for later versions until changed again. Each driver is held within sensible bounds.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const symbol = normSymbol(getRouterParam(event, 'symbol'))
  const i = symbolOk(symbol) ? await marketInstrument(symbol) : null
  if (!i || i.kind !== 'stock') throw apiError('not_found', 'Drivers apply to stocks only.', 404)
  const n = (lo: number, hi: number) => z.number().finite().min(lo).max(hi)
  const sh = z.object({ growth: n(-30, 30), margin: n(-30, 30), wacc: n(-5, 5) })
  const b = z.object({
    drivers: z.object({ growth: z.array(n(-50, 100)).length(10), margin: z.array(n(-100, 100)).length(10), tax: n(0, 50), reinvest: n(-50, 80), nwc: n(-100, 100), terminal_growth: n(-5, 6),
      scenarios: z.object({ bear: sh, bull: sh, p: z.tuple([n(0, 100), n(0, 100), n(0, 100)]) }).optional() }),
    note: z.string().max(500).optional()
  }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the drivers: ' + (b.error.issues[0]?.path.join('.') ?? '') + ' is out of range.')
  if (b.data.drivers.scenarios && b.data.drivers.scenarios.p.reduce((a, x) => a + x, 0) <= 0) throw apiError('invalid', 'The scenario weights must add up to more than zero.')
  const v = await valueSymbol(i, { drivers: b.data.drivers, by: 'team', userId: user.userId, note: b.data.note ?? null, refresh: false })
  if (!v) throw apiError('unavailable', 'No price for ' + symbol + ' yet, so it cannot be valued.', 409)
  await audit({ event, actorUserId: user.userId, action: 'markets.valuation_edit', objectType: 'markets.valuation', objectId: v.id, detail: { symbol, version: v.version, model_version: v.model_version, fair_value: v.fair_value, drivers: b.data.drivers, note: b.data.note ?? null } })
  return { id: v.id, version: v.version }
})
