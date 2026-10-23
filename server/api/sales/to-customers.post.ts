// Won new deals become customers in Financials once the founder accepts: named after the deal's customer, starting
// the month the deal was won; revenue comes in with the customer revenue data as usual.
import { z } from 'zod'
import { custKey } from '~/shared/customer-metrics'
export default defineEventHandler(async (event) => {
  const user = await requireRole(event, 'admin', 'gp')
  const b = z.object({ deal_ids: z.array(z.string().uuid()).min(1).max(100) }).safeParse(await readBody(event))
  if (!b.success) throw apiError('invalid', 'Choose the deals.')
  if (!(await enabledModules()).has('fin_customers')) throw apiError('forbidden', 'Customers in Financials is not on your plan.', 403)
  const main = await companyEntityId()
  const ds = (await db().query<{ id: string; name: string; customer_name: string | null; closed_at: string | null; entity_id: string | null; p_entity: string | null }>('SELECT d.id, d.name, d.customer_name, d.closed_at::text, d.entity_id, p.entity_id AS p_entity FROM growth.deals d JOIN growth.processes p ON p.id = d.process_id WHERE d.id = ANY($1::uuid[])', [b.data.deal_ids])).rows
  let added = 0
  for (const d of ds) {
    const name = (d.customer_name ?? d.name).slice(0, 200), key = custKey(name), ent = d.entity_id ?? d.p_entity ?? main
    const r = await db().query("INSERT INTO financials.customers (entity_id, name, key, started_on) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [ent, name, key, d.closed_at ? d.closed_at.slice(0, 10) : null])
    added += r.rowCount ?? 0
    await db().query('UPDATE growth.deals SET customer_key = $2, customer_name = coalesce(customer_name, $3) WHERE id = $1', [d.id, key, name])
  }
  await audit({ event, actorUserId: user.userId, action: 'sales.to_customers', objectType: 'growth_deal', detail: { deals: ds.length, added } })
  return { ok: true, added }
})
