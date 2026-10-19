// Set or clear the company's own (book) rate for some months: units of the currency per 1 USD. The group figures and
// the group's customer revenue use them from the next read.
import { z } from 'zod'
const Body = z.object({ rates: z.array(z.object({ quote: z.string().regex(/^[A-Z]{3}$/), month: z.string().regex(/^\d{4}-\d{2}$/), per_usd: z.number().positive().max(1e7).nullable() })).min(1).max(600) })
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = Body.safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the rates: units of the currency per 1 USD, by month.')
  for (const r of b.data.rates) {
    if (r.quote === 'USD') continue
    if (r.per_usd === null) await db().query('DELETE FROM fx.monthly WHERE quote = $1 AND month = $2::date', [r.quote, r.month + '-01'])
    else await db().query(`INSERT INTO fx.monthly (quote, month, per_usd, source) VALUES ($1, $2::date, $3, 'typed')
      ON CONFLICT (organization_id, quote, month) DO UPDATE SET per_usd = EXCLUDED.per_usd, source = 'typed', updated_at = now()`, [r.quote, r.month + '-01', r.per_usd])
  }
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'group%' OR subject LIKE 'customers:%' OR subject LIKE 'advice:%'").catch(() => {})
  await audit({ event, actorUserId: user.userId, action: 'financials.fx_rates', objectType: 'fx', detail: { months: b.data.rates.length } })
  return { ok: true }
})
