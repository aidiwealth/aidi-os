// Start an update for a month or quarter, blank or from one of Finvry's ready-made formats.
import { z } from 'zod'
import { STARTERS } from '~/shared/update-starters'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ period_type: z.enum(['month', 'quarter']), period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), starter: z.enum(['quarterly', 'monthly']).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the period.')
  const org = (await currentOrg())!
  const label = updateLabel(b.data.period_type, b.data.period_end), st = STARTERS.find((x) => x.key === b.data.starter)
  const title = st ? org.name + ' ' + label + (b.data.period_type === 'quarter' ? ' Report' : ' Update') : org.name + ': ' + label + ' update'
  const r = await one<{ id: string }>('INSERT INTO financials.updates (title, period_type, period_end, created_by, blocks) VALUES ($1,$2,$3,$4,$5) RETURNING id', [title, b.data.period_type, b.data.period_end, user.userId, JSON.stringify(st ? st.blocks(org.name, label) : [])])
  return { ok: true, id: r.id }
})
