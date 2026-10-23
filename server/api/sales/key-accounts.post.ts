// Put existing customers (from Financials) into a sales process as key-account deals: an expansion (grow their spend
// by a share of what they pay now) or a renewal. Customers that already have an open deal are skipped.
import { z } from 'zod'
import { custKey } from '~/shared/customer-metrics'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp', 'team')
  const b = z.object({ process_id: z.string().uuid(), keys: z.array(z.string().max(200)).min(1).max(200), deal_type: z.enum(['expansion', 'renewal']).default('expansion'), uplift_pct: z.number().min(0).max(1000).default(20) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the customers.')
  const d = b.data
  const p = (await db().query<{ stages: { key: string; kind: string }[]; entity_id: string | null }>("SELECT stages, entity_id FROM growth.processes WHERE id = $1 AND kind = 'sales'", [d.process_id])).rows[0]
  if (!p) throw apiError('not_found', 'That sales process was not found.', 404)
  const sc = await forecastScope(event)
  event.context.custEntity = sc.group ? '' : sc.entity ?? ''
  const cs = await loadCustomers(), last = cs.reduce((m, c) => Object.keys(c.rev).reduce((a, k) => (k > a ? k : a), m), '')
  const already = new Set((await db().query<{ customer_key: string }>('SELECT customer_key FROM growth.deals WHERE process_id = $1 AND customer_key IS NOT NULL AND closed_at IS NULL', [d.process_id])).rows.map((r) => r.customer_key))
  const first = p.stages.find((s) => s.kind === 'open')!.key, ent = p.entity_id ?? (sc.group ? null : sc.entity)
  let added = 0
  for (const k of d.keys) {
    const c = cs.find((x) => custKey(x.name) === k); if (!c || already.has(k)) continue
    const yearNow = (c.rev[last] ?? 0) * 12, value = d.deal_type === 'renewal' ? Math.round(yearNow) : Math.round(yearNow * d.uplift_pct / 100)
    const id = (await one<{ id: string }>('INSERT INTO growth.deals (process_id, name, value, recurring, stage_key, owner_id, entity_id, deal_type, customer_key, customer_name, notes) VALUES ($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
      [d.process_id, c.name + (d.deal_type === 'renewal' ? ' · renewal' : ' · expansion'), value || null, first, user.userId, ent, d.deal_type, k, c.name, d.deal_type === 'renewal' ? 'Renewal of about ' + Math.round(yearNow).toLocaleString('en-US') + ' a year.' : 'Grow spend by ' + d.uplift_pct + '% (about ' + Math.round(yearNow).toLocaleString('en-US') + ' a year today).'])).id
    await db().query('INSERT INTO growth.deal_moves (deal_id, from_stage, to_stage, by_user) VALUES ($1, NULL, $2, $3)', [id, first, user.userId])
    added++
  }
  return { ok: true, added, skipped: d.keys.length - added }
})
