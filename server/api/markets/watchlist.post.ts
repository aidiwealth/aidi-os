// Follow a symbol, or stop following it.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const b = z.object({ symbol: z.string().min(1).max(12), on: z.boolean() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Name a symbol.')
  const symbol = normSymbol(b.data.symbol)
  const i = symbolOk(symbol) ? await ensureInstrument(symbol) : null
  if (!i) throw apiError('not_found', 'Not a symbol we can price.', 404)
  if (b.data.on) await db().query('INSERT INTO markets.watchlist (symbol, added_by) VALUES ($1, $2) ON CONFLICT DO NOTHING', [symbol, user.userId])
  else await db().query('DELETE FROM markets.watchlist WHERE symbol = $1', [symbol])
  return { ok: true, watch: b.data.on }
})
