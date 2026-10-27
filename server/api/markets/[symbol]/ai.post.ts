// Ask the AI to review a symbol again now (in the background), or switch a stock back to the drivers in the AI's latest
// review after the team had set its own. Both are recorded in the audit log.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const symbol = normSymbol(getRouterParam(event, 'symbol'))
  const i = symbolOk(symbol) ? await marketInstrument(symbol) : null
  if (!i) throw apiError('not_found', 'Not found.', 404)
  const b = z.object({ action: z.enum(['review', 'apply']) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Say what to do.')
  if (!useRuntimeConfig().anthropicApiKey) throw apiError('ai_off', 'AI is not set up on this server.', 503)
  if (b.data.action === 'review') {
    if (reviewRunning(symbol)) return { started: false, running: true }
    const p = aiReview(i, { force: true }); event.waitUntil?.(p)
    await audit({ event, actorUserId: user.userId, action: 'markets.ai_review_requested', objectType: 'markets.instrument', objectId: symbol })
    return { started: true }
  }
  const rv = await latestReview(symbol)
  if (!rv?.review.drivers) throw apiError('invalid', 'The latest AI review has no drivers to use.', 409)
  const ok = await applyReview(i, rv.id, rv.review.drivers, rv.review.headline)
  if (!ok) throw apiError('unavailable', 'Could not value ' + symbol + ' with those drivers just now.', 409)
  await audit({ event, actorUserId: user.userId, action: 'markets.ai_drivers_applied', objectType: 'markets.ai_review', objectId: rv.id, detail: { symbol } })
  return { applied: true }
})
