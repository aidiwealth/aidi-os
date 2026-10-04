// AI first draft from this period's figures and the founder's notes. The founder edits before publishing or sending.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  rateLimit('update_ai', user.userId, 20, 60 * 60 * 1000)
  const id = z.string().uuid().safeParse(getRouterParam(event, 'id'))
  const b = z.object({ highlights: z.string().max(4000).default(''), challenges: z.string().max(4000).default(''), asks: z.string().max(2000).default('') }).safeParse(await readBody(event))
  if (!id.success || !b.success) throw apiError('invalid', 'Invalid request.')
  const u = (await db().query<{ period_type: string; period_end: string }>("SELECT period_type, to_char(period_end, 'YYYY-MM-DD') AS period_end FROM financials.updates WHERE id = $1", [id.data])).rows[0]
  if (!u) throw apiError('not_found', 'Not found', 404)
  const f = await periodFigures(u.period_type, u.period_end)
  try {
    const out = await draftUpdate({ company: (await currentOrg())!.name, periodLabel: updateLabel(u.period_type, u.period_end), currency: f.currency, current: f.current, previous: f.previous, ...b.data, ref: 'update:' + id.data })
    return out
  } catch (err) { console.error('[updates] draft failed', err); throw apiError('ai_failed', 'Could not draft the update just now. Try again, or write it yourself.', 502) }
})
