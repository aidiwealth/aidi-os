// Retention settings: currency of the customer figures, how to group customers, and the size bands.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).optional(), group_by: z.enum(['size', 'segment', 'sector', 'plan', 'country']).optional(), enterprise_arr: z.number().positive().max(1e12).optional(), midmarket_arr: z.number().positive().max(1e12).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the settings.')
  const c = { ...(await customerConfig()), ...b.data }
  if (c.midmarket_arr >= c.enterprise_arr) throw apiError('invalid', 'The mid-market band must start below the enterprise band.')
  await db().query(`INSERT INTO financials.customer_config (currency, group_by, enterprise_arr, midmarket_arr, scheme) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (organization_id) DO UPDATE SET currency = EXCLUDED.currency, group_by = EXCLUDED.group_by, enterprise_arr = EXCLUDED.enterprise_arr, midmarket_arr = EXCLUDED.midmarket_arr, updated_at = now()`, [c.currency, c.group_by, c.enterprise_arr, c.midmarket_arr, c.scheme ? JSON.stringify(c.scheme) : null])
  return { ok: true }
})
