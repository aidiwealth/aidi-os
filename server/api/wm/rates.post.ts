// Staff: record an interest rate (Nigerian T-bills, bank CDs, savings rates…) so its history shows as a chart.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ id: z.string().uuid().optional(), delete: z.boolean().optional(), country: z.enum(['US', 'NG']).optional(), product: z.string().trim().min(1).max(80).optional(), rate: z.number().min(0).max(100).optional(), as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), source: z.string().max(120).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the rate.')
  const d = b.data
  if (d.id && d.delete) { await db().query('DELETE FROM wm.rates WHERE id = $1', [d.id]); return { ok: true } }
  if (!d.country || !d.product || d.rate == null || !d.as_of) throw apiError('invalid', 'Add the country, product, rate and date.')
  await db().query('INSERT INTO wm.rates (country, product, rate, as_of, source) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (organization_id, country, product, as_of) DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source', [d.country, d.product, d.rate, d.as_of, d.source || null])
  await audit({ event, actorUserId: user.userId, action: 'wm.rate', objectType: 'organization', objectId: undefined, detail: d })
  return { ok: true }
})
