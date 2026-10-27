// An admin or GP sets an assumption from a date, with its source. Values are added, never overwritten, and every change
// goes to the audit log, so any valuation can be traced to what was in force.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireMarkets(event)
  const keys = Object.keys(MARKET_ASSUMPTIONS) as [MarketAssumptionKey, ...MarketAssumptionKey[]]
  const b = z.object({ key: z.enum(keys), value: z.number().finite(), effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), source_url: z.string().max(500).optional().nullable(), note: z.string().max(500).optional().nullable() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Give a value and the date it applies from.')
  const m = MARKET_ASSUMPTIONS[b.data.key]
  if (b.data.value < m.min || b.data.value > m.max) throw apiError('invalid', m.label + ' must be between ' + m.min + ' and ' + m.max + '.')
  if (Date.parse(b.data.effective_date) > Date.now() + 366 * 86400e3 || Number.isNaN(Date.parse(b.data.effective_date))) throw apiError('invalid', 'Check the date.')
  const url = (b.data.source_url ?? '').trim()
  if (url && !/^https?:\/\/\S+$/.test(url)) throw apiError('invalid', 'The source must be a web address (https://…).')
  if (b.data.key === 'mrp_us' && !url) throw apiError('invalid', 'Add the source for the market risk premium (the page you took it from).')
  const id = (await db().query<{ id: string }>('INSERT INTO markets.assumptions (key, value, effective_date, source_url, note, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [b.data.key, b.data.value, b.data.effective_date, url || null, b.data.note?.trim() || null, user.userId])).rows[0]!.id
  await audit({ event, actorUserId: user.userId, action: 'markets.assumption', objectType: 'markets.assumption', objectId: id, detail: { key: b.data.key, value: b.data.value, effective_date: b.data.effective_date, source_url: url || null } })
  return { ok: true, current: await marketAssumptions() }
})
