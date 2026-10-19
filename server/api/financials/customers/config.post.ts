// Retention settings: currency of the customer figures, how to group customers, the size bands, and how customers pay
// (subscription, usage, prepaid credits) with the months without revenue before a customer counts as lost.
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'gp')
  const b = z.object({ currency: z.string().regex(/^[A-Z]{3}$/).optional(), group_by: z.enum(['size', 'segment', 'sector', 'plan', 'country']).optional(), enterprise_arr: z.number().positive().max(1e12).optional(), midmarket_arr: z.number().positive().max(1e12).optional(),
    billing: z.enum(['subscription', 'usage', 'prepaid']).optional(), dormant_months: z.number().int().min(1).max(12).optional(), retention_basis: z.enum(['month', 'quarter', 'year']).optional() }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the settings.')
  const c = { ...(await customerConfig()), ...b.data }
  if (c.midmarket_arr >= c.enterprise_arr) throw apiError('invalid', 'The mid-market band must start below the enterprise band.')
  await db().query(`INSERT INTO financials.customer_config (currency, group_by, enterprise_arr, midmarket_arr, scheme, billing, dormant_months, retention_basis) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (organization_id) DO UPDATE SET currency = EXCLUDED.currency, group_by = EXCLUDED.group_by, enterprise_arr = EXCLUDED.enterprise_arr, midmarket_arr = EXCLUDED.midmarket_arr, billing = EXCLUDED.billing, dormant_months = EXCLUDED.dormant_months, retention_basis = EXCLUDED.retention_basis, updated_at = now()`, [c.currency, c.group_by, c.enterprise_arr, c.midmarket_arr, c.scheme ? JSON.stringify(c.scheme) : null, c.billing, c.dormant_months, c.retention_basis])
  await db().query("DELETE FROM financials.analyses WHERE subject LIKE 'customers:%' OR subject LIKE 'advice:%'").catch(() => {})
  return { ok: true }
})
