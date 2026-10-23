// A channel's results for a month (blank keeps the figure brought in from the rest of Finvry).
import { z } from 'zod'
const n = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(/[,\s$₦]/g, ''))), z.number().min(0).max(1e12).nullable())
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ process_id: z.string().uuid(), channel_key: z.string().max(40), month: z.string().regex(/^\d{4}-\d{2}$/), spend: n, visitors: n, leads: n, mqls: n, sqls: n, customers: n, revenue: n }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Numbers only.')
  const d = b.data
  if (!(await db().query("SELECT 1 FROM growth.processes WHERE id = $1 AND kind = 'marketing'", [d.process_id])).rowCount) throw apiError('not_found', 'Not found', 404)
  const i = (v: number | null) => (v === null ? null : Math.round(v))
  await db().query(`INSERT INTO growth.channel_months (process_id, channel_key, month, spend, visitors, leads, mqls, sqls, customers, revenue) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (process_id, channel_key, month) DO UPDATE SET spend = EXCLUDED.spend, visitors = EXCLUDED.visitors, leads = EXCLUDED.leads, mqls = EXCLUDED.mqls, sqls = EXCLUDED.sqls, customers = EXCLUDED.customers, revenue = EXCLUDED.revenue, updated_at = now()`,
    [d.process_id, d.channel_key, d.month, d.spend, i(d.visitors), i(d.leads), i(d.mqls), i(d.sqls), i(d.customers), d.revenue])
  return { ok: true }
})
