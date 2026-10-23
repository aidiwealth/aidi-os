// Customers from Financials for Sales, for the company chosen at the top (or the group): each with what it pays a month
// now and over the last year, and whether it already has an open deal, so the team can run key accounts (upsell,
// renewal) through the same pipeline. Also the won new deals not yet in Financials' customers, to add them.
import { custKey } from '~/shared/customer-metrics'
export default defineEventHandler(async (event) => {
  await requireRole(event, 'admin', 'gp', 'team')
  if (!(await usableModules((event.context.user as SessionUser).roles, event)).has('sales')) throw apiError('forbidden', 'Sales is not open to you.', 403)
  const sc = await forecastScope(event)
  event.context.custEntity = sc.group ? '' : sc.entity ?? ''
  const fin = (await enabledModules()).has('fin_customers')
  const cs = fin ? await loadCustomers().catch(() => []) : [], cfg = fin ? await customerConfig().catch(() => null) : null
  const last = cs.reduce((m, c) => Object.keys(c.rev).reduce((a, k) => (k > a ? k : a), m), '')
  const ms = last ? Array.from({ length: 12 }, (_, i) => { const d = new Date(last + '-15T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7) }) : []
  const main = await companyEntityId(), ent = sc.group ? null : sc.entity
  const open = (await db().query<{ customer_key: string; n: number }>(`SELECT d.customer_key, count(*)::int AS n FROM growth.deals d JOIN growth.processes p ON p.id = d.process_id
    WHERE d.customer_key IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.stages) s WHERE s->>'key' = d.stage_key AND s->>'kind' = 'open') AND ($1::uuid IS NULL OR coalesce(d.entity_id, p.entity_id, $2::uuid) = $1) GROUP BY 1`, [ent, main])).rows
  const openBy = new Map(open.map((r) => [r.customer_key, r.n]))
  const customers = cs.map((c) => ({ key: custKey(c.name), name: c.name, segment: c.segment, monthly: Math.round(c.rev[last] ?? 0), year: Math.round(ms.reduce((t, m) => t + (c.rev[m] ?? 0), 0)), open_deals: openBy.get(custKey(c.name)) ?? 0 }))
    .filter((c) => c.year > 0).sort((a, b) => b.year - a.year).slice(0, 500)
  const keys = new Set(cs.map((c) => custKey(c.name)))
  const won = (await db().query<{ id: string; name: string; customer_name: string | null; value: number | null; closed_at: string | null; process: string }>(`SELECT d.id, d.name, d.customer_name, d.value::float, d.closed_at::text, p.name AS process FROM growth.deals d JOIN growth.processes p ON p.id = d.process_id
    WHERE d.deal_type = 'new' AND d.customer_key IS NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.stages) s WHERE s->>'key' = d.stage_key AND s->>'kind' = 'won') AND ($1::uuid IS NULL OR coalesce(d.entity_id, p.entity_id, $2::uuid) = $1) ORDER BY d.closed_at DESC NULLS LAST LIMIT 100`, [ent, main])).rows
  return { enabled: fin, currency: cfg?.currency ?? sc.currency, as_of: last || null, customers, won_not_customers: fin ? won.filter((w) => !keys.has(custKey(w.customer_name ?? w.name))) : [] }
})
