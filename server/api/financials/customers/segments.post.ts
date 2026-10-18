// Apply a grouping: size bands, or custom segments given to each customer (kept on the customer's Segment).
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'gp')
  const b = z.object({ name: z.string().max(120), why: z.string().max(1000).default(''), kind: z.enum(['size', 'custom']), enterprise_arr: z.number().positive().nullable().optional(), midmarket_arr: z.number().positive().nullable().optional(),
    segments: z.array(z.object({ name: z.string().max(60), rule: z.string().max(300) })).max(12).default([]), assign: z.array(z.object({ id: z.string().uuid(), segment: z.string().max(60) })).max(20000).default([]) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Check the grouping.')
  const d = b.data, c = await customerConfig()
  const ent = d.kind === 'size' && d.enterprise_arr ? d.enterprise_arr : c.enterprise_arr, mid = d.kind === 'size' && d.midmarket_arr ? d.midmarket_arr : c.midmarket_arr
  if (mid >= ent) throw apiError('invalid', 'The mid-market band must start below the enterprise band.')
  if (d.kind === 'custom' && d.assign.length) await db().query('UPDATE financials.customers c SET segment = x.s, updated_at = now() FROM unnest($1::uuid[], $2::text[]) AS x(id, s) WHERE c.id = x.id', [d.assign.map((a) => a.id), d.assign.map((a) => a.segment)])
  await db().query(`INSERT INTO financials.customer_config (currency, group_by, enterprise_arr, midmarket_arr, scheme) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (organization_id) DO UPDATE SET group_by = EXCLUDED.group_by, enterprise_arr = EXCLUDED.enterprise_arr, midmarket_arr = EXCLUDED.midmarket_arr, scheme = EXCLUDED.scheme, updated_at = now()`,
    [c.currency, d.kind === 'size' ? 'size' : 'segment', ent, mid, JSON.stringify({ name: d.name, why: d.why, segments: d.segments })])
  await audit({ event, actorUserId: user.userId, action: 'customers.segments', objectType: 'customer', detail: { name: d.name, kind: d.kind, assigned: d.assign.length } })
  return { ok: true }
})
